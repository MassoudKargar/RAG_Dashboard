import { describe, it, expect, afterAll, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createApp } from "../../backend/src/server";

type FetchStub = (url: string, init?: ResponseInit & { signal?: AbortSignal }) => Promise<any>;

function streamBody(payload: unknown, maxBytes = 10 * 1024 * 1024) {
  const text = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(text)),
    }),
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        c.close();
      },
    }),
    text: async () => text,
  };
}

function httpGet(port: number, p: string): Promise<{ status: number; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: p, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode || 0, text: async () => text });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function boot(
  env: Record<string, string>,
  stub: FetchStub
): Promise<{ server: Server; port: number; restore: () => void }> {
  vi.stubGlobal("fetch", vi.fn(stub as any));

  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "rdash-"));
  const sample = path.join(tmpdir, "sample.json");
  fs.writeFileSync(sample, "[]");

  const full: Record<string, string> = {
    RAG_BENCHMARK_API_URL: "http://upstream.test",
    RAG_BENCHMARK_API_PATH: "/benchmark-runs",
    RAG_BENCHMARK_API_AUTH_MODE: "none",
    RAG_BENCHMARK_API_TIMEOUT_MS: "30000",
    RAG_BENCHMARK_API_MAX_RESPONSE_BYTES: "1048576",
    RAG_BENCHMARK_CACHE_TTL_SECONDS: "30",
    RAG_BENCHMARK_ALLOW_STALE_SECONDS: "3600",
    ENABLE_DEMO_MODE: "false",
    ...env,
  };
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(full)) {
    prev.set(k, process.env[k]);
    process.env[k] = v;
  }

  const { server } = createApp({ sampleFile: sample, staticDir: tmpdir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;

  return {
    server,
    port,
    restore: () => {
      for (const [k, v] of prev) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      server.close();
      vi.unstubAllGlobals();
    },
  };
}

// Detach all created apps after each suite so listening servers don't leak.
const apps: { restore: () => void }[] = [];
afterAll(() => {
  for (const a of apps) a.restore();
});

describe("backend /api/runs and /api/health", () => {
  it("normalizes a successful array response", async () => {
    const a = await boot({}, async () => streamBody([{ id: "run-103", metrics: { exactAt1: 0.96, mrr: 0.973 } }]));
    apps.push(a);
    const res = await httpGet(a.port, "/api/runs");
    const body = JSON.parse(await res.text());
    expect(res.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].metrics.exactAt1).toBe(0.96);
    expect(body.meta.dataMode).toBe("api");
    expect(body.meta.stale).toBe(false);
  });

  it("handles { runs: [] } payload", async () => {
    const a = await boot({}, async () => streamBody({ runs: [] }));
    apps.push(a);
    const body = JSON.parse(await (await httpGet(a.port, "/api/runs")).text());
    expect(body.runs).toEqual([]);
  });

  it("handles invalid JSON with sanitized error", async () => {
    const a = await boot({}, async () => ({
      ...streamBody(""),
      text: async () => "not-json{{{",
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode("not-json{{{"));
          c.close();
        },
      }),
    }));
    apps.push(a);
    const res = await httpGet(a.port, "/api/runs");
    const blob = await res.text();
    expect(res.status).toBe(502);
    expect(blob).not.toContain("not-json");
    expect(blob).toMatch(/runs/);
  });

  it("returns sanitized response on upstream auth (401) error", async () => {
    const a = await boot(
      { RAG_BENCHMARK_API_AUTH_MODE: "bearer", RAG_BENCHMARK_API_TOKEN: "SUPERSECRETTOKEN" },
      async () => ({ ok: false, status: 401, headers: new Headers(), body: null, text: async () => "" })
    );
    apps.push(a);
    const res = await httpGet(a.port, "/api/runs");
    const health = await (await httpGet(a.port, "/api/health")).text();
    const all = (await res.text()) + health;
    expect(res.status).toBe(502);
    expect(all).not.toContain("SUPERSECRETTOKEN");
  });

  it("returns 502 when upstream unreachable and no stale is allowed", async () => {
    const a = await boot(
      { RAG_BENCHMARK_ALLOW_STALE_SECONDS: "0" },
      async () => {
        throw new TypeError("fetch failed");
      }
    );
    apps.push(a);
    const res = await httpGet(a.port, "/api/runs");
    expect(res.status).toBe(502);
  });

  it("times out when upstream exceeds the timeout", async () => {
    const a = await boot(
      { RAG_BENCHMARK_API_TIMEOUT_MS: "50" },
      async (_url: string, init?: any) =>
        new Promise((_res, _rej) => {
          // Never resolves; abort signal should fire.
          init?.signal?.addEventListener("abort", () => _res({ ok: false, status: 0, headers: new Headers(), body: null, text: async () => "" }));
        })
    );
    apps.push(a);
    const res = await httpGet(a.port, "/api/runs");
    expect(res.status).toBe(502);
  });

  it("rejects an oversized upstream response", async () => {
    const a = await boot(
      { RAG_BENCHMARK_API_MAX_RESPONSE_BYTES: "100" },
      async () => streamBody([{ id: "x", name: "waytoo"+ "l".repeat(500) }])
    );
    apps.push(a);
    const res = await httpGet(a.port, "/api/runs");
    expect(res.status).toBe(502);
  });

  it("serves stale cached data after upstream recovers problem-free window", async () => {
    let mode: "ok" | "fail" = "ok";
    const a = await boot(
      { RAG_BENCHMARK_CACHE_TTL_SECONDS: "1", RAG_BENCHMARK_ALLOW_STALE_SECONDS: "3600" },
      async () => {
        if (mode === "fail") throw new TypeError("fetch failed");
        return streamBody([{ id: "stale-run", metrics: { mrr: 0.5 } }]);
      }
    );
    apps.push(a);
    expect(JSON.parse(await (await httpGet(a.port, "/api/runs")).text()).meta.stale).toBe(false);
    // force expiry
    await new Promise((r) => setTimeout(r, 1100));
    mode = "fail";
    const body = JSON.parse(await (await httpGet(a.port, "/api/runs")).text());
    expect(body.meta.stale).toBe(true);
    expect(body.runs[0].id).toBe("stale-run");
  });

  it("cache hit does not re-call upstream within TTL", async () => {
    let calls = 0;
    const a = await boot(
      { RAG_BENCHMARK_CACHE_TTL_SECONDS: "3600" },
      async () => {
        calls++;
        return streamBody([{ id: "cached" }]);
      }
    );
    apps.push(a);
    await httpGet(a.port, "/api/runs");
    await httpGet(a.port, "/api/runs");
    expect(calls).toBe(1);
  });

  it("health endpoint reports status and upstream state", async () => {
    const a = await boot({}, async () => streamBody([{ id: "h" }]));
    apps.push(a);
    await httpGet(a.port, "/api/runs"); // populate lastSuccessfulFetch
    const body = JSON.parse(await (await httpGet(a.port, "/api/health")).text());
    expect(body.status).toBe("ok");
    expect(body.upstreamConfigured).toBe(true);
    expect(body.upstreamReachable).toBe(true);
  });
});
