/** Shared normalized shape. This is what the backend returns and the frontend renders. */

export type BenchMetric =
  | "exactAt1"
  | "exactAt5"
  | "exactAt10"
  | "mrr"
  | "persianAt5"
  | "yearAttribution"
  | "semantic"
  | "multiyear"
  | "cacheHitRate";

export type LatencyMetric = "latencyP50Ms" | "latencyP95Ms" | "latencyP99Ms";

export interface RunMetrics {
  exactAt1?: number;
  exactAt5?: number;
  exactAt10?: number;
  mrr?: number;
  persianAt5?: number;
  yearAttribution?: number;
  semantic?: number;
  multiyear?: number;

  latencyP50Ms?: number;
  latencyP95Ms?: number;
  latencyP99Ms?: number;

  failed?: number; // n_failed / failed checks
  testCount?: number;
  passedCount?: number;
  durationMs?: number; // benchmark duration
  cacheHitRate?: number;
  tokensUsed?: number;
  estimatedCost?: number;
}

export interface BenchmarkRun {
  id: string;
  name?: string;
  createdAt?: string; // ISO string or undefined (invalid/missing date)
  branch?: string;
  commitSha?: string;
  datasetVersion?: string;
  datasetSize?: number;
  model?: string;
  embeddingModel?: string;
  reranker?: string;
  retrievalStrategy?: string;
  chunkingStrategy?: string;
  topK?: number;
  environment?: string;
  notes?: string;
  tags?: string[];
  metrics: RunMetrics;
  /** Fields whose raw value was present but malformed (never silently zeroed). */
  invalidFields?: string[];
}

export interface RunsMeta {
  dataMode: "api" | "files" | "demo";
  stale: boolean;
  lastSuccessfulFetch?: string;
  source?: string;
}

export interface RunsResponse {
  runs: BenchmarkRun[];
  meta: RunsMeta;
}

export interface HealthResponse {
  status: string;
  upstreamConfigured: boolean;
  upstreamReachable: boolean;
  dataMode: "api" | "files" | "demo";
  lastSuccessfulFetch?: string;
}
