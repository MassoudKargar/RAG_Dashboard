import { describe, it, expect } from "vitest";
import { calculateComparison } from "../../frontend/src/lib/compare";
import {
  QUALITY_METRICS,
  LATENCY_METRICS,
  LOWER_COUNT_METRICS,
  MetricDef,
} from "../../frontend/src/lib/metrics";

function def(key: string, direction: "higher" | "lower", unit: string): MetricDef {
  return { key: key as any, label: key, short: key, direction, unit, read: () => undefined };
}

const exact1 = QUALITY_METRICS.find((m) => m.key === "exactAt1")!;
const p95 = LATENCY_METRICS.find((m) => m.key === "latencyP95Ms")!;
const failed = LOWER_COUNT_METRICS.find((m) => m.key === "failed")!;

describe("higher-is-better calculations", () => {
  it("positive absolute delta is an improvement", () => {
    const c = calculateComparison(exact1, 0.9, 0.8);
    expect(c.absoluteDelta).toBeCloseTo(0.1);
    expect(c.classification).toBe("improvement");
  });

  it("relative percent uses abs(baseline): ((p-b)/abs(b))*100", () => {
    const c = calculateComparison(exact1, 0.9, 0.8);
    expect(c.relativePercent).toBeCloseTo(12.5); // 0.1/0.8
    expect(c.relativeUnavailable).toBe(false);
  });

  it("negative absolute delta is a regression", () => {
    const c = calculateComparison(exact1, 0.7, 0.8);
    expect(c.absoluteDelta).toBeCloseTo(-0.1);
    expect(c.classification).toBe("regression");
  });

  it("equal values are no change", () => {
    const c = calculateComparison(exact1, 0.8, 0.8);
    expect(c.classification).toBe("no_change");
    expect(c.absoluteDelta).toBeCloseTo(0);
  });
});

describe("lower-is-better calculations", () => {
  it("negative raw delta is an improvement", () => {
    const c = calculateComparison(p95, 200, 250);
    expect(c.absoluteDelta).toBeCloseTo(-50);
    expect(c.classification).toBe("improvement");
  });

  it("positive raw delta is a regression", () => {
    const c = calculateComparison(p95, 300, 250);
    expect(c.absoluteDelta).toBeCloseTo(50);
    expect(c.classification).toBe("regression");
  });

  it("improvement percent = (baseline-primary)/baseline", () => {
    const c = calculateComparison(p95, 200, 250);
    expect(c.relativePercent).toBeCloseTo(20); // (250-200)/250
  });

  it("failed count lower is better", () => {
    const c = calculateComparison(failed, 0, 24);
    expect(c.classification).toBe("improvement");
  });
});

describe("zero and missing baselines", () => {
  it("does not compute relative percent when baseline is zero (higher-is-better)", () => {
    const c = calculateComparison(exact1, 0.5, 0);
    expect(c.relativeUnavailable).toBe(true);
    expect(c.relativePercent).toBeUndefined();
    expect(c.classification).toBe("improvement");
  });

  it("does not compute relative percent when baseline is zero (lower-is-better)", () => {
    const c = calculateComparison(p95, 100, 0);
    expect(c.relativeUnavailable).toBe(true);
    expect(c.absoluteDelta).toBeCloseTo(100);
    expect(c.classification).toBe("regression");
  });

  it("missing baseline leaves comparison incomplete, never treated as zero", () => {
    const c = calculateComparison(exact1, 0.9, undefined);
    expect(c.incomplete).toBe(true);
    expect(c.classification).toBe("incomplete");
    expect(c.absoluteDelta).toBeUndefined();
    expect(c.relativePercent).toBeUndefined();
  });

  it("missing primary leaves comparison incomplete", () => {
    const c = calculateComparison(exact1, undefined, 0.8);
    expect(c.incomplete).toBe(true);
    expect(c.absoluteDelta).toBeUndefined();
  });
});

describe("no premature rounding", () => {
  it("keeps full decimal precision before display", () => {
    const c = calculateComparison(exact1, 0.96, 0.8057142857142857);
    // exact compare without rounding
    expect(c.absoluteDelta).toBe(0.96 - 0.8057142857142857);
    expect(c.relativePercent).toBeCloseTo((0.96 - 0.8057142857142857) / 0.8057142857142857 * 100, 10);
  });
});

describe("self-comparison prevention / logic", () => {
  it("comparing a value with itself yields no change", () => {
    const c = calculateComparison(p95, 250, 250);
    expect(c.classification).toBe("no_change");
  });
});
