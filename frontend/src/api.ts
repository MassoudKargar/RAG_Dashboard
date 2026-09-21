import { RunsResponse } from "./types";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Same-origin dashboard API. Credentials never reach the browser. */
export async function fetchRuns(signal?: AbortSignal): Promise<RunsResponse> {
  const res = await fetch("/api/runs", { signal, headers: { Accept: "application/json" } });
  if (res.status === 502) {
    throw new ApiError("Benchmark API is unreachable or returned no data.", 502);
  }
  if (!res.ok) {
    throw new ApiError(`Dashboard API returned ${res.status}.`, res.status);
  }
  let body: RunsResponse;
  try {
    body = (await res.json()) as RunsResponse;
  } catch {
    throw new ApiError("Dashboard API returned an invalid response.");
  }
  return body;
}

export async function fetchHealth(signal?: AbortSignal): Promise<{ status: string; dataMode: string; stale: boolean }> {
  const res = await fetch("/api/health", { signal });
  if (!res.ok) throw new ApiError("Health check failed.");
  return (await res.json()) as { status: string; dataMode: string; stale: boolean };
}
