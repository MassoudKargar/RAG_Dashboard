import { LoadState } from "../hooks/useRuns";

export function StatusBanner({
  state,
  error,
  stale,
  hasData,
  onRetry,
}: {
  state: LoadState;
  error?: string;
  stale?: boolean;
  hasData?: boolean;
  onRetry?: () => void;
}) {
  // Full failure: no data at all.
  if (state === "error") {
    return (
      <div className="banner banner--error" role="alert">
        <span>⚠ Failed to load benchmark data. {error ?? ""}</span>
        {onRetry && (
          <button className="btn btn--sm" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  // Background refresh failed but previously loaded data is still displayed.
  if (error && hasData) {
    return (
      <div className="banner banner--error" role="alert">
        <span>⚠ Refresh failed. Showing previously loaded data. {error ?? ""}</span>
        {onRetry && (
          <button className="btn btn--sm" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  if (stale) {
    return (
      <div className="banner banner--warn" role="status">
        <span>⚠ Showing stale cached data — the upstream API is currently unavailable.</span>
      </div>
    );
  }
  if (state === "empty") {
    return (
      <div className="banner banner--warn" role="status">
        <span>No benchmark runs found. Configure the upstream API or enable demo mode.</span>
      </div>
    );
  }
  return null;
}