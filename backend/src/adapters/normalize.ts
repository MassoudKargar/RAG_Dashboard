import {
  BenchmarkRun,
  BenchMetric,
  LatencyMetric,
  RunMetrics,
} from "../validation/types.js";
import {
  toSafeId,
  toOptionalString,
  toOptionalInt,
  toQuality,
  toLatencyMs,
  toCount,
} from "../validation/validate.js";

/**
 * Isolated normalization adapter.
 *
 * Maps many plausible upstream field names (aliases + flat/nested layouts) onto
 * one canonical BenchmarkRun. UI components only ever see the canonical shape.
 *
 * PARITY RULE: A raw 96 is left as 96 and then rejected by the [0,1] quality
 * range check — we never guess that 96 means 0.96. If an upstream contract
 * explicitly uses percentage units, that conversion belongs in a dedicated
 * adapter, not here.
 */

type Raw = Record<string, unknown>;

// --- Metrics lookup ------------------------------------------------------

// Canonical metric -> candidate raw keys (case normalized to lower).
const METRIC_KEYS: Record<BenchMetric, string[]> = {
  exactAt1: ["exact@1", "exact_at_1", "exactat1", "exact_recall_at_1"],
  exactAt5: ["exact@5", "exact_at_5", "exactat5", "exact_recall_at_5"],
  exactAt10: ["exact@10", "exact_at_10", "exactat10", "exact_recall_at_10"],
  mrr: ["mrr", "mrr@1", "mrr_at_1"],
  persianAt5: ["persian@5", "persian_at_5", "persianat5", "persian_recall_at_5", "persian_recall_at5"],
  yearAttribution: ["year_attribution", "yearattribution"],
  semantic: ["semantic", "semantic_recall_at_5", "semantic@5"],
  multiyear: ["multiyear", "multiyear_all_years", "multiyearall"],
  cacheHitRate: ["cache_hit_rate", "cachehitrate", "cache_hit"],
};

const LATENCY_KEYS: Record<LatencyMetric, string[]> = {
  latencyP50Ms: ["latency.p50", "latency.p50_ms", "latency_p50_ms", "latencyp50ms", "latencyp50", "latency.p50.clamped", "p50"],
  latencyP95Ms: ["latency.p95", "latency.p95_ms", "latency_p95_ms", "latencyp95ms", "latencyp95", "latency.p95.clamped", "p95"],
  latencyP99Ms: ["latency.p99", "latency.p99_ms", "latency_p99_ms", "latencyp99ms", "latencyp99", "latency.p99.clamped", "p99"],
};

const COUNT_KEYS: Record<string, string[]> = {
  failed: ["n_failed", "failed", "failedcount", "failed_count", "failed_checks"],
  // NOTE: "count" is intentionally NOT an alias for testCount — in real
  // artifacts it is the latency-sample count, not a test count.
  testCount: ["test_count", "testcount", "n_tests", "n_exact"],
  passedCount: ["passed_count", "passedcount", "passed"],
  durationMs: ["duration_ms", "durationms", "duration", "benchmark_duration_ms", "latency_duration_ms"],
  tokensUsed: ["tokens_used", "tokensused", "token_usage", "total_tokens"],
  estimatedCost: ["estimated_cost", "estimatedcost", "cost", "cost_usd"],
};

/** Case-folded key index of a (possibly nested) raw object.
 * Both full paths ("metrics.exactAt1") and leaf names ("exactAt1") are
 * indexed so aliases can match inside nested metric objects. */
function flatten(raw: Raw): Map<string, unknown> {
  const map = new Map<string, unknown>();
  const walk = (obj: Raw, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Raw, key);
      } else {
        map.set(key.toLowerCase(), v);
        // Leaf name without prefix: lets an alias match inside nested objects.
        map.set(k.toLowerCase(), v);
      }
    }
  };
  walk(raw, "");
  return map;
}

function pick<T>(flat: Map<string, unknown>, aliases: string[]): T | undefined {
  for (const a of aliases) {
    if (flat.has(a.toLowerCase())) return flat.get(a.toLowerCase()) as T;
  }
  return undefined;
}

// --- Run extraction -------------------------------------------------------

function extractMetrics(raw: Raw): { metrics: RunMetrics; invalid: string[] } {
  const flat = flatten(raw);
  const metrics: RunMetrics = {};
  const invalid: string[] = [];

  for (const [canon, aliases] of Object.entries(METRIC_KEYS)) {
    const v = pick(flat, aliases);
    if (v === undefined || v === null) continue;
    const q = toQuality(v);
    if (q === undefined) invalid.push(canon);
    else metrics[canon as BenchMetric] = q;
  }
  for (const [canon, aliases] of Object.entries(LATENCY_KEYS)) {
    const v = pick(flat, aliases);
    if (v === undefined || v === null) continue;
    const lat = toLatencyMs(v);
    if (lat === undefined) invalid.push(canon);
    else metrics[canon as LatencyMetric] = lat;
  }
  for (const [canon, aliases] of Object.entries(COUNT_KEYS)) {
    const v = pick(flat, aliases);
    if (v === undefined || v === null) continue;
    const c = toCount(v);
    if (c === undefined) invalid.push(canon);
    else (metrics as Record<string, number>)[canon] = c;
  }
  return { metrics, invalid };
}

export function normalizeRun(raw: unknown): BenchmarkRun | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Raw;

  const id = toSafeId(r.id ?? r.runId ?? r.run_id ?? r.key);
  if (!id) return null;

  const { metrics, invalid } = extractMetrics(r);

  const run: BenchmarkRun = {
    id,
    name: toOptionalString(r.name ?? r.runName ?? r.run_name),
    createdAt: toOptionalString(r.createdAt ?? r.created_at ?? r.timestamp ?? r.date),
    branch: toOptionalString(r.branch),
    commitSha: toOptionalString(r.commitSha ?? r.commit_sha ?? r.commit),
    datasetVersion: toOptionalString(r.datasetVersion ?? r.dataset_version ?? r.dataset),
    datasetSize: toOptionalInt(r.datasetSize ?? r.dataset_size),
    model: toOptionalString(r.model ?? r.llm ?? r.llm_model ?? r.chatModel ?? r.chat_model),
    embeddingModel: toOptionalString(r.embeddingModel ?? r.embedding_model),
    reranker: toOptionalString(r.reranker),
    retrievalStrategy: toOptionalString(r.retrievalStrategy ?? r.retrieval_strategy),
    chunkingStrategy: toOptionalString(r.chunkingStrategy ?? r.chunking_strategy),
    topK: toOptionalInt(r.topK ?? r.top_k ?? r.k),
    environment: toOptionalString(r.environment ?? r.env),
    notes: toOptionalString(r.notes),
    tags: Array.isArray(r.tags)
      ? r.tags.map((t) => String(t)).filter(Boolean).slice(0, 20)
      : undefined,
    metrics,
  };
  if (invalid.length) run.invalidFields = invalid;
  return run;
}

/**
 * Accept: array, { runs: [] }, or paginated { runs: [], page, pageSize, total }.
 * Deduplicates by id (first occurrence wins) and sorts by date descending
 * (runs with no date sort last, stable).
 */
export function normalizeRuns(payload: unknown): BenchmarkRun[] {
  let list: unknown[] = [];
  if (Array.isArray(payload)) list = payload;
  else if (payload && typeof payload === "object") {
    const runs = (payload as Record<string, unknown>).runs;
    if (Array.isArray(runs)) list = runs;
  }

  const runs: BenchmarkRun[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const r = normalizeRun(item);
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      runs.push(r);
    }
  }

  runs.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
    if (!Number.isNaN(ta)) return -1;
    if (!Number.isNaN(tb)) return 1;
    return 0;
  });
  return runs;
}
