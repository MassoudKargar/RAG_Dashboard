import { BenchMetric, LatencyMetric, RunMetrics } from "../types";

/**
 * Central definition of every metric the dashboard knows about: whether higher
 * or lower is better, which unit it's shown in, and how to read it from the
 * normalized RunMetrics.
 */

export interface MetricDef {
  key: BenchMetric | LatencyMetric | "failed" | "passedCount" | "durationMs" | "tokensUsed" | "estimatedCost";
  label: string;
  /** Short label for card/axis space. */
  short: string;
  /** higher-is-better (quality) vs lower-is-better (latency/cost/failures). */
  direction: "higher" | "lower";
  /** Display unit: percent | 3dp | ms | count | cost | duration */
  unit: "percent" | "3dp" | "ms" | "count" | "cost" | "duration";
  /** 0..1 shows as percent. */
  read: (m: RunMetrics) => number | undefined;
}

const quality: MetricDef[] = [
  { key: "exactAt1", label: "Exact@1", short: "Exact@1", direction: "higher", unit: "percent", read: (m) => m.exactAt1 },
  { key: "exactAt5", label: "Exact@5", short: "Exact@5", direction: "higher", unit: "percent", read: (m) => m.exactAt5 },
  { key: "exactAt10", label: "Exact@10", short: "Exact@10", direction: "higher", unit: "percent", read: (m) => m.exactAt10 },
  { key: "mrr", label: "MRR", short: "MRR", direction: "higher", unit: "3dp", read: (m) => m.mrr },
  { key: "persianAt5", label: "Persian@5", short: "Persian@5", direction: "higher", unit: "percent", read: (m) => m.persianAt5 },
  { key: "yearAttribution", label: "Year attribution", short: "Year attr.", direction: "higher", unit: "percent", read: (m) => m.yearAttribution },
  { key: "semantic", label: "Semantic recall", short: "Semantic", direction: "higher", unit: "percent", read: (m) => m.semantic },
  { key: "multiyear", label: "Multiyear", short: "Multiyear", direction: "higher", unit: "percent", read: (m) => m.multiyear },
  { key: "cacheHitRate", label: "Cache hit rate", short: "Cache", direction: "higher", unit: "percent", read: (m) => m.cacheHitRate },
  { key: "passedCount", label: "Passed checks", short: "Passed", direction: "higher", unit: "count", read: (m) => m.passedCount },
];

const latency: MetricDef[] = [
  { key: "latencyP50Ms", label: "Latency p50", short: "p50", direction: "lower", unit: "ms", read: (m) => m.latencyP50Ms },
  { key: "latencyP95Ms", label: "Latency p95", short: "p95", direction: "lower", unit: "ms", read: (m) => m.latencyP95Ms },
  { key: "latencyP99Ms", label: "Latency p99", short: "p99", direction: "lower", unit: "ms", read: (m) => m.latencyP99Ms },
];

const lowerCount: MetricDef[] = [
  { key: "failed", label: "Failed checks", short: "Failed", direction: "lower", unit: "count", read: (m) => m.failed },
  { key: "durationMs", label: "Benchmark duration", short: "Duration", direction: "lower", unit: "duration", read: (m) => m.durationMs },
  { key: "tokensUsed", label: "Tokens used", short: "Tokens", direction: "lower", unit: "count", read: (m) => m.tokensUsed },
  { key: "estimatedCost", label: "Estimated cost", short: "Cost", direction: "lower", unit: "cost", read: (m) => m.estimatedCost },
];

export const QUALITY_METRICS = quality;
export const LATENCY_METRICS = latency;
export const LOWER_COUNT_METRICS = lowerCount;

/** Every comparably-classified metric in display order. */
export const ALL_METRIC_DEFS: MetricDef[] = [...quality, ...latency, ...lowerCount];

export function isHigherBetter(def: MetricDef): boolean {
  return def.direction === "higher";
}
