import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, Config } from "./config.js";
import { fetchUpstream } from "./adapters/upstream.js";
import { loadBenchmarkFiles } from "./adapters/files.js";
import { normalizeRuns, normalizeRun } from "./adapters/normalize.js";
import { RunsCache } from "./services/cache.js";
import { BenchmarkRun, RunsMeta } from "./validation/types.js";
import { createAdmin, handleAdmin, AdminContext } from "./admin/api.js";
import { log } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../frontend/dist");

export function createApp(opts?: { staticDir?: string; sampleFile?: string; adminCtx?: AdminContext }) {
  const cfg = loadConfig();
  const cache = new RunsCache();
  const staticDir = opts?.staticDir ?? DIST_DIR;
  const sampleFile = opts?.sampleFile ?? path.resolve(__dirname, "../../sample-data/benchmark-runs.sample.json");
  const adminCtx = opts?.adminCtx ?? createAdmin();

  // Load demo sample data once at boot (only used when demo mode is active).
  let demoRuns: BenchmarkRun[] = [];
  try {
    if (fs.existsSync(sampleFile)) {
      const parsed = JSON.parse(fs.readFileSync(sampleFile, "utf8"));
      demoRuns = normalizeRuns(parsed);
    }
  } catch (e) {
    log("warn", "sample data could not be loaded", { error: String((e as Error).message) });
  }

  // Health state tracking
  const state = { lastSuccessfulFetch: undefined as string | undefined };

  async function loadRuns(): Promise<{ runs: BenchmarkRun[]; meta: RunsMeta; status: number }> {
    // Option B: read-only benchmark artifact files (real data, no credentials).
    if (cfg.dataMode === "files") {
      const res = loadBenchmarkFiles(cfg);
      state.lastSuccessfulFetch = new Date().toISOString();
      cache.set({
        runs: res.runs,
        fetchedAt: Date.now(),
        source: res.meta.source ?? "benchmark-artifacts",
        dataMode: "files",
      });
      return { runs: res.runs, meta: res.meta, status: 200 };
    }

    // Demo mode: bundled sample data, clearly flagged.
    if (!cfg.upstreamConfigured || cfg.demoMode) {
      const entry = {
        runs: demoRuns,
        fetchedAt: Date.now(),
        source: "sample-data",
        dataMode: "demo" as const,
      };
      cache.set(entry);
      return {
        runs: demoRuns,
        meta: { dataMode: "demo", stale: false, lastSuccessfulFetch: state.lastSuccessfulFetch, source: "sample-data" },
        status: 200,
      };
    }

    // Try a fresh cache hit first.
    const fresh = cache.getFresh(cfg.cacheTtlSeconds);
    if (fresh) {
      log("info", "cache hit", { count: fresh.runs.length });
      return {
        runs: fresh.runs,
        meta: { dataMode: "api", stale: false, lastSuccessfulFetch: state.lastSuccessfulFetch, source: fresh.source },
        status: 200,
      };
    }

    const t0 = Date.now();
    log("info", "upstream fetch start", { url: cfg.upstreamUrl ? "configured" : "none" });
    const result = await fetchUpstream(cfg);
    const elapsed = Date.now() - t0;

    if (result.ok && result.payload !== undefined) {
      const runs = normalizeRuns(result.payload);
      state.lastSuccessfulFetch = new Date().toISOString();
      cache.set({
        runs,
        fetchedAt: Date.now(),
        source: "upstream",
        dataMode: "api",
      });
      log("info", "upstream fetch ok", { durationMs: elapsed, count: runs.length });
      return {
        runs,
        meta: {
          dataMode: "api",
          stale: false,
          lastSuccessfulFetch: state.lastSuccessfulFetch,
          source: "upstream",
        } as RunsMeta,
        status: 200,
      };
    }

    // Upstream failed. Fall back to stale cached data if still legible.
    const stale = cache.getStaleLegible(cfg.allowStaleSeconds);
    if (stale) {
      log("warn", "upstream failed, serving stale", {
        reason: result.error?.kind,
        durationMs: elapsed,
      });
      return { runs: stale.entry.runs, meta: stale.meta, status: 200 };
    }

    log("warn", "upstream failed, no stale available", {
      reason: result.error?.kind,
      durationMs: elapsed,
    });
    return {
      runs: [],
      meta: {
        dataMode: "api",
        stale: false,
        lastSuccessfulFetch: state.lastSuccessfulFetch,
        source: "upstream",
      },
      status: 502,
    };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // Security headers on every response.
    const securityHeaders = {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control": "no-store",
    };
    for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);

    // --- API routes ---
    if (pathname === "/api/health") {
      const fresh = cache.getFresh(cfg.cacheTtlSeconds);
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: "ok",
          upstreamConfigured: cfg.upstreamConfigured,
          upstreamReachable: cfg.upstreamConfigured ? Boolean(state.lastSuccessfulFetch) : false,
          dataMode: cfg.dataMode,
          lastSuccessfulFetch: state.lastSuccessfulFetch,
          demo: cfg.demoMode && cfg.dataMode !== "files",
        })
      );
      return;
    }

    if (pathname === "/api/runs") {
      const result = await loadRuns();
      res.setHeader("Content-Type", "application/json");
      res.writeHead(result.status);
      res.end(JSON.stringify({ runs: result.runs, meta: result.meta }));
      return;
    }

    // --- Admin console (auth + RAG management) ---
    if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/admin/")) {
      const handled = handleAdmin(req, res, adminCtx);
      if (handled !== false) return;
      res.setHeader("Content-Type", "application/json");
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // --- Static frontend ---
    let filePath = pathname === "/" ? "/index.html" : pathname;
    const full = path.normalize(path.join(staticDir, filePath));
    if (!full.startsWith(path.resolve(staticDir))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    let content;
    try {
      content = fs.readFileSync(full);
    } catch {
      // SPA fallback
      try {
        content = fs.readFileSync(path.join(staticDir, "index.html"));
      } catch {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
    }
    res.setHeader("Content-Type", mimeFor(full));
    // Serve static build assets with an explicit Content-Length (no chunked
    // transfer): large chunked bodies are truncated by the CDN edge in some
    // pass-through setups, which showed up as a blank page (broken JS bundle).
    if (pathname.startsWith("/assets/")) {
      res.setHeader("Content-Length", String(Buffer.byteLength(content)));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
    res.writeHead(200);
    res.end(content);
  });

  return { server, cfg };
}

function mimeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const { server } = createApp();
  server.listen(cfg.port, cfg.host, () => {
    log("info", "dashboard listening", { host: cfg.host, port: cfg.port, mode: cfg.demoMode ? "demo" : "api" });
  });
  server.on("error", (e) => {
    log("error", "server error", { error: String((e as Error).message) });
    process.exit(1);
  });
  const shutdown = () => {
    log("info", "shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
