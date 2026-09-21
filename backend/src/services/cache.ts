import { BenchmarkRun, RunsMeta } from "../validation/types.js";

export interface CacheEntry {
  runs: BenchmarkRun[];
  fetchedAt: number; // epoch ms of last successful upstream fetch
  source: string;
  dataMode: "api" | "files" | "demo";
}

/**
 * Tiny in-memory cache. Stores the last successful normalized result and the
 * time it was fetched so the UI can serve stale data (explicitly flagged) when
 * the upstream is temporarily unavailable.
 */
export class RunsCache {
  private entry?: CacheEntry;

  set(e: CacheEntry): void {
    this.entry = e;
  }

  getFresh(ttlSeconds: number): CacheEntry | undefined {
    if (!this.entry) return undefined;
    const freshMs = ttlSeconds * 1000;
    if (Date.now() - this.entry.fetchedAt > freshMs) return undefined;
    return this.entry;
  }

  getStaleLegible(allowStaleSeconds: number): { entry: CacheEntry; meta: RunsMeta } | undefined {
    if (!this.entry) return undefined;
    const staleMs = allowStaleSeconds * 1000;
    if (Date.now() - this.entry.fetchedAt > staleMs) return undefined;
    return {
      entry: this.entry,
      meta: {
        dataMode: this.entry.dataMode,
        stale: true,
        lastSuccessfulFetch: new Date(this.entry.fetchedAt).toISOString(),
        source: this.entry.source,
      },
    };
  }

  getMeta(): RunsMeta | undefined {
    if (!this.entry) return undefined;
    return {
      dataMode: this.entry.dataMode,
      stale: false,
      lastSuccessfulFetch: new Date(this.entry.fetchedAt).toISOString(),
      source: this.entry.source,
    };
  }

  clear(): void {
    this.entry = undefined;
  }
}
