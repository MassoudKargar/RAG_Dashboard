import { RunsMeta } from "../types";

export function DataBadge({ meta, refreshing }: { meta?: RunsMeta; refreshing?: boolean }) {
  if (!meta) return null;
  const isDemo = meta.dataMode === "demo";
  const isFiles = meta.dataMode === "files";
  const isStale = meta.stale;
  return (
    <div className="data-badges" role="status" aria-live="polite">
      {isDemo && <span className="badge demo">DEMO DATA</span>}
      {isFiles && <span className="badge api">REAL DATA (files)</span>}
      {isStale && <span className="badge stale">STALE CACHE</span>}
      {meta.dataMode === "api" && !isStale && <span className="badge api">LIVE API</span>}
      {refreshing && <span className="badge refreshing">Refreshing…</span>}
    </div>
  );
}
