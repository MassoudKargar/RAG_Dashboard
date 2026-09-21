import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRuns } from "../api";
import { BenchmarkRun, RunsMeta } from "../types";

export type LoadState =
  | "loading" // first load
  | "refreshing" // background refresh while data is shown
  | "ready"
  | "empty"
  | "error";

export interface RunsState {
  runs: BenchmarkRun[];
  meta?: RunsMeta;
  state: LoadState;
  error?: string;
  lastRefreshedAt?: string;
  refresh: () => Promise<void>;
}

/**
 * Loads /api/runs. Preserves currently displayed data during a background
 * refresh (never blanks the page). Exposes an empty/error/ready signal through
 * `state` while keeping `runs` intact.
 */
export function useRuns(): RunsState {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [meta, setMeta] = useState<RunsMeta | undefined>();
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | undefined>();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // If we already have data, this is a background refresh (preserve data).
    setState((st) => (st === "ready" || st === "empty" ? "refreshing" : "loading"));
    setError(undefined);

    try {
      const res = await fetchRuns(controller.signal);
      if (controller.signal.aborted) return;
      setRuns(res.runs);
      setMeta(res.meta);
      setLastRefreshedAt(new Date().toISOString());
      setState(res.runs.length === 0 ? "empty" : "ready");
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "Failed to load data.";
      setError(msg);
      // If we have data already, fall back to showing it with an error banner.
      setState(() => (runs.length > 0 ? "ready" : "error"));
    }
  }, [runs.length]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { runs, meta, state, error, lastRefreshedAt, refresh };
}
