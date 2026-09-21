/** Environment configuration. Values are parsed once at boot. */

export type AuthMode = "none" | "bearer" | "header";

function bool(v: string | undefined, dflt = false): boolean {
  if (v === undefined) return dflt;
  return v === "1" || v.toLowerCase() === "true";
}

function int(v: string | undefined, dflt: number): number {
  if (v === undefined) return dflt;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

function str(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s && s.length > 0 ? s : undefined;
}

function authMode(v: string | undefined): AuthMode {
  const m = v?.trim().toLowerCase();
  if (m === "bearer") return "bearer";
  if (m === "header") return "header";
  return "none";
}

export type DataMode = "api" | "files" | "demo";

export interface Config {
  host: string;
  port: number;
  dataMode: DataMode;
  upstreamUrl?: string;
  upstreamPath: string;
  authMode: AuthMode;
  authToken?: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  timeoutMs: number;
  maxResponseBytes: number;
  cacheTtlSeconds: number;
  allowStaleSeconds: number;
  demoMode: boolean;
  logLevel: string;
  /** Whether a real upstream is fully configured. */
  upstreamConfigured: boolean;
  /** Files mode: read-only artifact directory (Option B). */
  resultsDir?: string;
  resultsFiles: string[];
  /** Per-file latency unit hint, parallel to resultsFiles: "ms" | "seconds". */
  resultsLatencyUnits: Array<"ms" | "seconds">;
  /** ---- RAG Administration Console (DIRECT PRODUCTION MANAGEMENT) ---- */
  ragApiUrl?: string;
  ragApiKey?: string;
  adminUsername: string;
  adminDataDir: string;
  uploadMaxBytes: number;
  uploadMaxBatch: number;
  uploadMaxText: number;
  sessionTtlMinutes: number;
  loginMaxAttempts: number;
  loginWindowMinutes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const upstreamUrl = str(env.RAG_BENCHMARK_API_URL);
  const dataModeRaw = str(env.RAG_BENCHMARK_DATA_MODE);
  const up = {
    host: str(env.DASHBOARD_HOST) ?? "127.0.0.1",
    port: int(env.DASHBOARD_PORT, 4173),
    dataMode: (dataModeRaw === "files"
      ? "files"
      : dataModeRaw === "api" || upstreamUrl
        ? "api"
        : "demo") as DataMode,
    upstreamUrl,
    upstreamPath: str(env.RAG_BENCHMARK_API_PATH) ?? "/benchmark-runs",
    authMode: authMode(env.RAG_BENCHMARK_API_AUTH_MODE),
    authToken: str(env.RAG_BENCHMARK_API_TOKEN),
    authHeaderName: str(env.RAG_BENCHMARK_API_HEADER_NAME),
    authHeaderValue: str(env.RAG_BENCHMARK_API_HEADER_VALUE),
    timeoutMs: int(env.RAG_BENCHMARK_API_TIMEOUT_MS, 10000),
    maxResponseBytes: int(env.RAG_BENCHMARK_API_MAX_RESPONSE_BYTES, 5 * 1024 * 1024),
    cacheTtlSeconds: int(env.RAG_BENCHMARK_CACHE_TTL_SECONDS, 30),
    allowStaleSeconds: int(env.RAG_BENCHMARK_ALLOW_STALE_SECONDS, 3600),
    demoMode: bool(env.ENABLE_DEMO_MODE, true),
    logLevel: str(env.LOG_LEVEL) ?? "info",
  };

  // Bearer auth requires a token; header auth requires a name. If required fields
  // are missing, treat the upstream as misconfigured (do not send partial auth).
  let effectiveAuth = up.authMode;
  if (effectiveAuth === "bearer" && !up.authToken) effectiveAuth = "none";
  if (effectiveAuth === "header" && !up.authHeaderName) effectiveAuth = "none";

  const upstreamConfigured = Boolean(upstreamUrl);

  // Files mode options (only relevant when dataMode === "files").
  const resultsDir = str(env.RAG_BENCHMARK_RESULTS_DIR);
  const resultsFiles = (str(env.RAG_BENCHMARK_RESULTS_FILES) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const units = (str(env.RAG_BENCHMARK_RESULTS_LATENCY_UNITS) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === "ms" || s === "seconds") as Array<"ms" | "seconds">;

  const admin: Config = {
    ...up,
    authMode: effectiveAuth,
    upstreamConfigured,
    resultsDir,
    resultsFiles,
    resultsLatencyUnits: units,
    ragApiUrl: str(env.RAG_API_URL) ?? "http://127.0.0.1:8000",
    ragApiKey: str(env.RAG_API_KEY),
    adminUsername: str(env.ADMIN_USERNAME) ?? "admin",
    adminDataDir: str(env.ADMIN_DATA_DIR) ?? "/var/lib/rag-console",
    uploadMaxBytes: int(env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024),
    uploadMaxBatch: int(env.UPLOAD_MAX_BATCH, 5),
    uploadMaxText: int(env.UPLOAD_MAX_TEXT, 2 * 1024 * 1024),
    sessionTtlMinutes: int(env.SESSION_TTL_MINUTES, 480),
    loginMaxAttempts: int(env.LOGIN_MAX_ATTEMPTS, 5),
    loginWindowMinutes: int(env.LOGIN_WINDOW_MINUTES, 10),
  };
  return admin;
}
