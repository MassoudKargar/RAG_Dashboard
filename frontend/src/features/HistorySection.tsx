import { useMemo, useState } from "react";
import { BenchmarkRun } from "../types";
import { truncate } from "../lib/format";

interface Props {
  runs: BenchmarkRun[];
  primaryId: string;
  baselineId: string;
  onSetPrimary: (id: string) => void;
  onSetBaseline: (id: string) => void;
}

type SortKey = "date" | "exactAt1" | "mrr" | "latencyP95Ms";

export function HistorySection({ runs, primaryId, baselineId, onSetPrimary, onSetBaseline }: Props) {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [model, setModel] = useState("all");
  const [dataset, setDataset] = useState("all");
  const [sort, setSort] = useState<SortKey>("date");

  const branches = useMemo(
    () => Array.from(new Set(runs.map((r) => r.branch).filter(Boolean))).sort() as string[],
    [runs]
  );
  const models = useMemo(
    () => Array.from(new Set(runs.map((r) => r.model).filter(Boolean))).sort() as string[],
    [runs]
  );
  const datasets = useMemo(
    () => Array.from(new Set(runs.map((r) => r.datasetVersion).filter(Boolean))).sort() as string[],
    [runs]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = runs.filter((r) => {
      if (branch !== "all" && r.branch !== branch) return false;
      if (model !== "all" && r.model !== model) return false;
      if (dataset !== "all" && r.datasetVersion !== dataset) return false;
      if (needle) {
        const hay = `${r.id} ${r.name ?? ""} ${r.commitSha ?? ""} ${r.branch ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      switch (sort) {
        case "date":
          return (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0);
        case "exactAt1":
          return (b.metrics.exactAt1 ?? -1) - (a.metrics.exactAt1 ?? -1);
        case "mrr":
          return (b.metrics.mrr ?? -1) - (a.metrics.mrr ?? -1);
        case "latencyP95Ms":
          return (a.metrics.latencyP95Ms ?? Infinity) - (b.metrics.latencyP95Ms ?? Infinity);
        default:
          return 0;
      }
    });
  }, [runs, q, branch, model, dataset, sort]);

  return (
    <section className="panel" aria-label="Run history">
      <div className="section-head">
        <h2>Run history</h2>
      </div>
      <div className="filters">
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Run name, id, commit…"
            aria-label="Search runs"
          />
        </label>
        <label className="field">
          <span>Branch</span>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch">
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Filter by model">
            <option value="all">All models</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dataset</span>
          <select value={dataset} onChange={(e) => setDataset(e.target.value)} aria-label="Filter by dataset">
            <option value="all">All datasets</option>
            {datasets.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort runs">
            <option value="date">Date (newest)</option>
            <option value="exactAt1">Exact@1</option>
            <option value="mrr">MRR</option>
            <option value="latencyP95Ms">Latency p95</option>
          </select>
        </label>
      </div>

      <div className="run-table-wrap">
        <table className="run-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Date</th>
              <th>Exact@1</th>
              <th>MRR</th>
              <th>Lat p95</th>
              <th>Commits/Branch</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={r.id === primaryId ? "row-primary" : r.id === baselineId ? "row-baseline" : ""}>
                <td>
                  <div className="run-name">{r.name ?? r.id}</div>
                  <div className="run-sub">{truncate(r.model, 24) ?? "—"}</div>
                </td>
                <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "N/A"}</td>
                <td>{r.metrics.exactAt1 !== undefined ? `${(r.metrics.exactAt1 * 100).toFixed(1)}%` : "N/A"}</td>
                <td>{r.metrics.mrr !== undefined ? r.metrics.mrr.toFixed(3) : "N/A"}</td>
                <td>{r.metrics.latencyP95Ms !== undefined ? `${r.metrics.latencyP95Ms.toFixed(0)} ms` : "N/A"}</td>
                <td>
                  <span className="mono">{truncate(r.commitSha, 9) || "—"}</span>
                  <span className="chip">{r.branch ?? "—"}</span>
                </td>
                <td className="actions-col">
                  <button
                    className="btn btn--sm"
                    disabled={r.id === primaryId}
                    onClick={() => onSetPrimary(r.id)}
                    aria-label={`Set as primary`}
                  >
                    Primary
                  </button>
                  <button
                    className="btn btn--sm btn--ghost"
                    disabled={r.id === baselineId}
                    onClick={() => onSetBaseline(r.id)}
                    aria-label={`Set as baseline`}
                  >
                    Baseline
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-cell">No runs match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint">{filtered.length} of {runs.length} runs shown.</p>
    </section>
  );
}
