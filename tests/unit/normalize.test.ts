import { describe, it, expect } from "vitest";
import { normalizeRuns, normalizeRun } from "../../backend/src/adapters/normalize";

describe("metric alias coverage", () => {
  it("accepts exact@1 / exact_at_1 / exactAt1", () => {
    for (const key of ["exact@1", "exact_at_1", "exactAt1"]) {
      const r = normalizeRun({ id: "x", metrics: { [key]: 0.9 } });
      expect(r!.metrics.exactAt1).toBe(0.9);
    }
  });
  it("accepts MRR / mrr", () => {
    expect(normalizeRun({ id: "x", metrics: { mrr: 0.973 } })!.metrics.mrr).toBe(0.973);
    expect(normalizeRun({ id: "x", metrics: { MRR: 0.973 } })!.metrics.mrr).toBe(0.973);
  });
  it("accepts Persian@5 / persian_at_5 / persianAt5", () => {
    for (const key of ["Persian@5", "persian_at_5", "persianAt5"]) {
      expect(normalizeRun({ id: "x", metrics: { [key]: 1.0 } })!.metrics.persianAt5).toBe(1.0);
    }
  });
  it("accepts year_attribution / yearAttribution", () => {
    for (const key of ["year_attribution", "yearAttribution"]) {
      expect(normalizeRun({ id: "x", metrics: { [key]: 0.889 } })!.metrics.yearAttribution).toBe(0.889);
    }
  });
  it("accepts latency.p50 / latency.p50_ms / latency_p50_ms / latencyP50Ms", () => {
    for (const key of ["latency.p50", "latency.p50_ms", "latency_p50_ms", "latencyP50Ms"]) {
      expect(normalizeRun({ id: "x", metrics: { [key]: 192 } })!.metrics.latencyP50Ms).toBe(192);
    }
  });
  it("accepts n_failed / failed / failedCount", () => {
    for (const key of ["n_failed", "failed", "failedCount"]) {
      expect(normalizeRun({ id: "x", metrics: { [key]: 3 } })!.metrics.failed).toBe(3);
    }
  });
});

describe("flat and nested structures", () => {
  it("extracts nested latency object", () => {
    const r = normalizeRun({ id: "x", latency: { p50: 100, p95: 200, p99: 300 } });
    expect(r!.metrics.latencyP50Ms).toBe(100);
    expect(r!.metrics.latencyP95Ms).toBe(200);
    expect(r!.metrics.latencyP99Ms).toBe(300);
  });
  it("extracts nested metrics object", () => {
    const r = normalizeRun({ id: "x", metrics: { exactAt1: 0.5, mrr: 0.6 } });
    expect(r!.metrics.exactAt1).toBe(0.5);
  });
  it("flat numeric fields at top level", () => {
    const r = normalizeRun({ id: "x", exactAt1: 0.4, mrr: 0.3 });
    expect(r!.metrics.exactAt1).toBe(0.4);
  });
});

describe("missing values stay missing", () => {
  it("absent metrics remain undefined", () => {
    const r = normalizeRun({ id: "x" });
    expect(r!.metrics.exactAt1).toBeUndefined();
    expect(r!.metrics.latencyP95Ms).toBeUndefined();
  });
});

describe("invalid values are rejected, not zeroed", () => {
  it("negative latency is invalid", () => {
    const r = normalizeRun({ id: "x", metrics: { latencyP95Ms: -5 } });
    expect(r!.metrics.latencyP95Ms).toBeUndefined();
    expect(r!.invalidFields).toContain("latencyP95Ms");
  });
  it("quality above 1 is invalid", () => {
    const r = normalizeRun({ id: "x", metrics: { exactAt1: 1.5 } });
    expect(r!.metrics.exactAt1).toBeUndefined();
    expect(r!.invalidFields).toContain("exactAt1");
  });
  it("96 is NOT converted to 0.96 and is invalid for a quality metric", () => {
    const r = normalizeRun({ id: "x", metrics: { exactAt1: 96 } });
    expect(r!.metrics.exactAt1).toBeUndefined();
    expect(r!.invalidFields).toContain("exactAt1");
  });
  it("NaN and Infinity are invalid", () => {
    const rNaN = normalizeRun({ id: "x", metrics: { exactAt1: NaN } });
    expect(rNaN!.metrics.exactAt1).toBeUndefined();
    const rInf = normalizeRun({ id: "x", metrics: { latencyP95Ms: Infinity } });
    expect(rInf!.metrics.latencyP95Ms).toBeUndefined();
  });
  it("malformed numeric strings are invalid", () => {
    const r = normalizeRun({ id: "x", metrics: { mrr: "abc" } });
    expect(r!.metrics.mrr).toBeUndefined();
  });
  it("counts must be integers", () => {
    const r = normalizeRun({ id: "x", metrics: { failed: 2.5 } });
    expect(r!.metrics.failed).toBeUndefined();
  });
});

describe("run identity and ordering", () => {
  it("drops runs without an id", () => {
    const runs = normalizeRuns([{ name: "no-id" }, { id: "a" }]);
    expect(runs).toHaveLength(1);
  });
  it("deduplicates by id", () => {
    const runs = normalizeRuns([{ id: "a", x: 1 }, { id: "a", x: 2 }, { id: "b" }]);
    expect(runs).toHaveLength(2);
  });
  it("sorts by date descending by default", () => {
    const runs = normalizeRuns([
      { id: "old", createdAt: "2026-09-01T00:00:00Z" },
      { id: "new", createdAt: "2026-09-20T00:00:00Z" },
      { id: "mid", createdAt: "2026-09-10T00:00:00Z" },
    ]);
    expect(runs.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });
  it("accepts array, {runs:[]}, and paginated shapes", () => {
    expect(normalizeRuns([{ id: "a" }])).toHaveLength(1);
    expect(normalizeRuns({ runs: [{ id: "b" }] })).toHaveLength(1);
    expect(normalizeRuns({ runs: [{ id: "c" }], page: 1, pageSize: 50, total: 1 })).toHaveLength(1);
  });
});
