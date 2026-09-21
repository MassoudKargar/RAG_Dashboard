import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBenchmarkFiles } from "../../backend/src/adapters/files";
import { Config } from "../../backend/src/config";

// Real artifact schemas (values taken from the actual repo docs; reduced for brevity).
const CURRENT_ARTIFACT = JSON.stringify({
  n_exact: 25,
  n_semantic: 20,
  n_multiyear: 10,
  n_persian: 20,
  n_negative: 10,
  n_year: 18,
  n_failed: 0,
  exact_recall_at_1: 0.96,
  exact_recall_at_5: 1.0,
  exact_recall_at_10: 1.0,
  mrr: 0.9733333333333333,
  semantic_recall_at_5: 1.0,
  multiyear_all_years: 1.0,
  persian_recall_at_5: 1.0,
  year_attribution: 0.8888888888888888,
  latency: { p50: 0.1836404800415039, p95: 0.24178051948547363, p99: 0.5918278694152832, count: 100 },
});

const BASELINE_ARTIFACT = JSON.stringify({
  commit: "b7571cf",
  timestamp: "2026-09-08T05:20:00Z",
  total_chunks: 3387,
  retrieval: {
    exact_recall_at_1: 0.68,
    mrr: 0.8057142857142857,
    persian_recall_at_5: 0.7,
    multiyear_all_years: 0.2,
    year_attribution: 0.7222222222222222,
  },
  latency_retrieval_ms: { p50: 147.27, p95: 176.74, p99: 555.56 },
  n_failed: 24,
});

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
});

function cfg(overrides: Partial<Config> = {}): Config {
  return {
    host: "127.0.0.1",
    port: 1,
    dataMode: "files",
    demoMode: false,
    upstreamConfigured: false,
    resultsDir: dir,
    resultsFiles: ["MSFT_RAG_BENCHMARK.json", "MSFT_RAG_BASELINE.json"],
    resultsLatencyUnits: ["seconds", "ms"],
    timeoutMs: 1000,
    maxResponseBytes: 1000000,
    cacheTtlSeconds: 30,
    allowStaleSeconds: 3600,
    logLevel: "warn",
    authMode: "none",
    upstreamPath: "/benchmark-runs",
    ...overrides,
  } as Config;
}

describe("files adapter (Option B)", () => {
  it("normalizes the real current benchmark artifact with seconds->ms latency", () => {
    fs.writeFileSync(path.join(dir, "MSFT_RAG_BENCHMARK.json"), CURRENT_ARTIFACT);
    const res = loadBenchmarkFiles(cfg({ resultsFiles: ["MSFT_RAG_BENCHMARK.json"], resultsLatencyUnits: ["seconds"] }));
    expect(res.runs).toHaveLength(1);
    const r = res.runs[0];
    expect(r.metrics.exactAt1).toBe(0.96);
    expect(r.metrics.exactAt5).toBe(1.0);
    expect(r.metrics.exactAt10).toBe(1.0);
    expect(r.metrics.mrr).toBeCloseTo(0.9733333333333333, 10);
    expect(r.metrics.multiyear).toBe(1.0);
    expect(r.metrics.persianAt5).toBe(1.0);
    expect(r.metrics.yearAttribution).toBeCloseTo(0.8888888888888888, 10);
    // seconds -> ms conversion (explicit, not guessed)
    expect(r.metrics.latencyP50Ms).toBeCloseTo(183.6, 1);
    expect(r.metrics.latencyP95Ms).toBeCloseTo(241.8, 1);
    expect(r.metrics.latencyP99Ms).toBeCloseTo(591.8, 1);
    // failed + aggregated real test count (25+20+10+20+10+18 = 103)
    expect(r.metrics.failed).toBe(0);
    expect(r.metrics.testCount).toBe(103);
  });

  it("normalizes the real baseline artifact preserving commit/timestamp", () => {
    fs.writeFileSync(path.join(dir, "MSFT_RAG_BASELINE.json"), BASELINE_ARTIFACT);
    const res = loadBenchmarkFiles(cfg({ resultsFiles: ["MSFT_RAG_BASELINE.json"], resultsLatencyUnits: ["ms"] }));
    const r = res.runs[0];
    expect(r.commitSha).toBe("b7571cf");
    expect(r.createdAt).toBe("2026-09-08T05:20:00Z");
    expect(r.datasetSize).toBe(3387);
    expect(r.metrics.exactAt1).toBe(0.68);
    expect(r.metrics.mrr).toBeCloseTo(0.8057142857142857, 10);
    expect(r.metrics.persianAt5).toBe(0.7);
    expect(r.metrics.multiyear).toBe(0.2);
    expect(r.metrics.latencyP50Ms).toBeCloseTo(147.27, 2); // already ms, untouched
    expect(r.metrics.failed).toBe(24);
  });

  it("rejects path traversal filenames", () => {
    fs.writeFileSync(path.join(dir, "ok.json"), CURRENT_ARTIFACT);
    const res = loadBenchmarkFiles(
      cfg({ resultsFiles: ["../etc/passwd", "ok.json"], resultsLatencyUnits: ["seconds"] })
    );
    expect(res.runs).toHaveLength(1); // only ok.json loaded
  });

  it("rejects absolute-path filenames and skips missing files silently", () => {
    fs.writeFileSync(path.join(dir, "a.json"), CURRENT_ARTIFACT);
    const res = loadBenchmarkFiles(
      cfg({ resultsFiles: ["/etc/passwd", "missing.json", "a.json"], resultsLatencyUnits: ["seconds", "ms", "seconds"] })
    );
    expect(res.runs).toHaveLength(1);
  });

  it("skips malformed JSON without failing the whole load", () => {
    fs.writeFileSync(path.join(dir, "bad.json"), "{not json");
    fs.writeFileSync(path.join(dir, "good.json"), CURRENT_ARTIFACT);
    const res = loadBenchmarkFiles(
      cfg({ resultsFiles: ["bad.json", "good.json"], resultsLatencyUnits: ["seconds", "seconds"] })
    );
    expect(res.runs).toHaveLength(1);
  });

  it("reports files data mode in meta without leaking source details", () => {
    fs.writeFileSync(path.join(dir, "MSFT_RAG_BENCHMARK.json"), CURRENT_ARTIFACT);
    const res = loadBenchmarkFiles(cfg({ resultsFiles: ["MSFT_RAG_BENCHMARK.json"], resultsLatencyUnits: ["seconds"] }));
    expect(res.meta.dataMode).toBe("files");
    expect(res.meta.source).toBe("benchmark-artifacts");
    expect(JSON.stringify(res.meta)).not.toContain(dir); // no absolute paths leak
  });

  it("sorts newest runs first when both artifacts load", () => {
    fs.writeFileSync(path.join(dir, "MSFT_RAG_BENCHMARK.json"), CURRENT_ARTIFACT);
    fs.writeFileSync(path.join(dir, "MSFT_RAG_BASELINE.json"), BASELINE_ARTIFACT);
    const res = loadBenchmarkFiles(cfg());
    expect(res.runs).toHaveLength(2);
    // current (mtime fallback = now) sorts above baseline (embedded 2026-09-08)
    expect(res.runs[0].metrics.exactAt1).toBe(0.96);
    expect(res.runs[1].commitSha).toBe("b7571cf");
    expect(res.runs[1].createdAt).toBe("2026-09-08T05:20:00Z");
  });
});