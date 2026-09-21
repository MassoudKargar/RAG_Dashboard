import { useMemo, useState } from "react";
import { useRuns } from "./hooks/useRuns";
import { DataBadge } from "./components/DataBadge";
import { StatusBanner } from "./components/StatusBanner";
import { SummarySection } from "./features/SummarySection";
import { ComparisonSection } from "./features/ComparisonSection";
import { HistorySection } from "./features/HistorySection";
import { AdminConsole } from "./admin/AdminConsole";

type View = "benchmarks" | "admin";

export default function App() {
  const { runs, meta, state, error, lastRefreshedAt, refresh } = useRuns();
  const [primaryId, setPrimaryId] = useState<string>(runs[0]?.id ?? "");
  const [baselineId, setBaselineId] = useState<string>(runs[1]?.id ?? "");
  const [view, setView] = useState<View>("benchmarks");

  const primary = useMemo(
    () => runs.find((r) => r.id === primaryId) ?? runs[0],
    [runs, primaryId]
  );
  const baseline = useMemo(() => {
    if (!runs.length) return undefined;
    if (baselineId && baselineId !== primary?.id) {
      const b = runs.find((r) => r.id === baselineId);
      if (b) return b;
    }
    const candidate = runs.find((r) => r.id !== primary?.id);
    return candidate ?? runs[0];
  }, [runs, baselineId, primary]);

  const swap = () => {
    if (!primary || !baseline) return;
    setPrimaryId(baseline.id);
    setBaselineId(primary.id);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title-block">
          <h1>RAG Benchmark Dashboard</h1>
          <DataBadge meta={meta} refreshing={state === "refreshing"} />
        </div>
        <div className="app-header-right">
          {lastRefreshedAt && (
            <span className="last-refresh">Last refresh: {new Date(lastRefreshedAt).toLocaleTimeString()}</span>
          )}
          <button className="btn" onClick={() => void refresh()} disabled={state === "loading" || state === "refreshing"}>
            Refresh
          </button>
        </div>
      </header>

      <nav className="console-nav" aria-label="Dashboard sections">
        <button
          className={`console-tab ${view === "benchmarks" ? "console-tab--active" : ""}`}
          onClick={() => setView("benchmarks")}
        >
          Benchmarks
        </button>
        <button
          className={`console-tab ${view === "admin" ? "console-tab--active" : ""}`}
          onClick={() => setView("admin")}
        >
          Administration
        </button>
      </nav>

      {view === "admin" && <AdminConsole />}

      {view === "benchmarks" && (
        <>
          <StatusBanner state={state} error={error} stale={meta?.stale} hasData={runs.length > 0} onRetry={() => void refresh()} />

          <div className="selectors panel">
            <div className="selector">
              <span className="selector-label">Primary run</span>
              <select value={primary?.id ?? ""} onChange={(e) => setPrimaryId(e.target.value)} aria-label="Primary run">
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.name ?? r.id}</option>
                ))}
              </select>
            </div>
            <div className="selector">
              <span className="selector-label">Baseline run</span>
              <select value={baseline?.id ?? ""} onChange={(e) => setBaselineId(e.target.value)} aria-label="Baseline run">
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.name ?? r.id}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn--ghost"
              onClick={swap}
              disabled={!primary || !baseline || primary.id === baseline.id}
              aria-label="Swap primary and baseline runs"
            >
              ⇄ Swap runs
            </button>
          </div>

          {state === "loading" && !runs.length && (
            <div className="panel loading-panel" role="status">Loading benchmark data…</div>
          )}

          {runs.length > 0 && primary && baseline ? (
            <>
              <SummarySection runs={runs} primary={primary} baseline={baseline} />
              <ComparisonSection primary={primary} baseline={baseline} />
              <HistorySection
                runs={runs}
                primaryId={primary.id}
                baselineId={baseline.id}
                onSetPrimary={(id) => setPrimaryId(id)}
                onSetBaseline={(id) => setBaselineId(id)}
              />
            </>
          ) : (
            state !== "loading" && runs.length === 0 && (
              <div className="panel">
                <p className="hint">
                  No data to display. If the upstream API is unreachable and demo mode is disabled, configure the API or
                  enable <code>ENABLE_DEMO_MODE=true</code>.
                </p>
              </div>
            )
          )}
        </>
      )}

      <footer className="app-footer">
        <span>Private deployment · Same-origin only · No external tracking.</span>
        {meta?.dataMode === "demo" && view === "benchmarks" && <span className="badge demo">DEMO DATA</span>}
      </footer>
    </div>
  );
}