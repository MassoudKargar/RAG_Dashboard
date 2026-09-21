import fs from "node:fs";
import path from "node:path";
import { Config } from "../config.js";
import { normalizeRun } from "./normalize.js";
import { BenchmarkRun, RunsMeta } from "../validation/types.js";
import { toSafeId, toOptionalString } from "../validation/validate.js";
import { log } from "../logger.js";

/**
 * Option-B adapter: read-only benchmark artifact files.
 *
 * Safety properties:
 * - Reads ONLY from one explicitly configured directory (RAG_BENCHMARK_RESULTS_DIR).
 * - Reads ONLY explicitly allowlisted filenames (RAG_BENCHMARK_RESULTS_FILES).
 * - Filenames must be plain basenames; resolved paths are validated inside the
 *   directory; traversal is rejected.
 * - Whole-file atomic reads; a malformed/unreadable file is skipped, never fatal.
 * - Nothing is written; artifacts are never modified.
 *
 * Unit hints: some artifacts store latency in seconds (e.g. the current MSFT
 * benchmark JSON uses 0.1836 = 183.6 ms). The unit is an explicit per-file
 * configuration (RAG_BENCHMARK_RESULTS_LATENCY_UNITS), never guessed from
 * magnitudes.
 */

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

function latencyMs(v: number | undefined, unit: "ms" | "seconds"): number | undefined {
  if (v === undefined) return undefined;
  return unit === "seconds" ? v * 1000 : v;
}

function applyLatencyUnit(run: BenchmarkRun, unit: "ms" | "seconds"): void {
  const m = run.metrics;
  m.latencyP50Ms = latencyMs(m.latencyP50Ms, unit);
  m.latencyP95Ms = latencyMs(m.latencyP95Ms, unit);
  m.latencyP99Ms = latencyMs(m.latencyP99Ms, unit);
}

/**
 * testCount = real aggregate of n_* counters when present. Asserts the exact
 * sum (25+20+10+20+10+18 = 103 for the current artifact), overriding the
 * generic single-counter "n_exact" alias from validation.
 */
function applyTestCount(raw: Record<string, unknown>, run: BenchmarkRun): void {
  const counters = ["n_exact", "n_semantic", "n_multiyear", "n_persian", "n_negative", "n_year"];
  let sum = 0;
  let any = false;
  for (const key of counters) {
    const v = raw[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
      sum += v;
      any = true;
    }
  }
  if (any) run.metrics.testCount = sum;
}

function deriveId(filename: string): string {
  return filename
    .replace(/\.json$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveName(filename: string): string {
  return filename.replace(/\.json$/i, "").replace(/_/g, " ").toUpperCase();
}

export function loadBenchmarkFiles(cfg: Config): { runs: BenchmarkRun[]; meta: RunsMeta } {
  const empty: RunsMeta = {
    dataMode: "files",
    stale: false,
    source: "benchmark-artifacts",
  };

  const dirRaw = cfg.resultsDir;
  if (!dirRaw) {
    log("warn", "files mode: results dir not configured");
    return { runs: [], meta: empty };
  }
  const dir = path.resolve(dirRaw);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    log("warn", "files mode: results dir missing", { dir });
    return { runs: [], meta: empty };
  }

  const runs: BenchmarkRun[] = [];
  let loaded = 0;
  cfg.resultsFiles.forEach((file: string, i: number) => {
    if (!SAFE_FILENAME.test(file)) {
      log("warn", "files mode: filename rejected (not a plain basename)", { file });
      return;
    }
    const full = path.join(dir, file);
    const resolved = path.resolve(full);
    if (!resolved.startsWith(dir + path.sep)) {
      log("warn", "files mode: path escapes results dir", { file });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
    } catch (e) {
      log("warn", "files mode: file unreadable or invalid, skipped", {
        file,
        error: String((e as Error).message).slice(0, 120),
      });
      return;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      log("warn", "files mode: not a single-run object, skipped", { file });
      return;
    }
    const obj = raw as Record<string, unknown>;
    // Artifacts carry no id; derive a stable one per file BEFORE normalization
    // (the canonical schema requires an id). Derived, documented — not fabricated
    // metrics.
    const derivId = toSafeId(obj.id ?? obj.run_id ?? obj.runId) ?? deriveId(file);
    const provisioned: Record<string, unknown> = { ...obj, id: derivId };
    if (typeof obj.name !== "string") provisioned.name = deriveName(file);
    let run = normalizeRun(provisioned);
    if (!run) {
      log("warn", "files mode: no usable run extracted", { file });
      return;
    }
    // File-level metadata (only from the artifact itself; never fabricated).
    run.id = derivId;
    run.name = run.name ?? toOptionalString(obj.name) ?? deriveName(file);
    if (!run.createdAt) run.createdAt = toOptionalString(obj.timestamp ?? obj.created_at);
    if (!run.commitSha) run.commitSha = toOptionalString(obj.commit ?? obj.commit_sha);
    if (!run.datasetSize && typeof obj.total_chunks === "number") run.datasetSize = obj.total_chunks;
    // Explicit per-file unit hint (parallel list; defaults to ms).
    const unit: "ms" | "seconds" = cfg.resultsLatencyUnits[i] ?? "ms";
    applyLatencyUnit(run, unit);
    applyTestCount(obj, run);
    // Timestamp fallback: only the artifact's own embedded timestamp, else the
    // file's real mtime (verifiable filesystem metadata, documented in meta).
    if (!run.createdAt) {
      try {
        run.createdAt = fs.statSync(resolved).mtime.toISOString();
      } catch {
        /* keep missing */
      }
    }
    runs.push(run);
    loaded++;
  });

  // Same ordering rule as the API path: newest first, no-date last (stable).
  runs.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
    if (!Number.isNaN(ta)) return -1;
    if (!Number.isNaN(tb)) return 1;
    return 0;
  });

  log("info", "files mode: loaded benchmark artifacts", { loaded, dir });
  return {
    runs,
    meta: { ...empty, lastSuccessfulFetch: new Date().toISOString() },
  };
}