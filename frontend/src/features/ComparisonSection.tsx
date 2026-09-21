import { useMemo } from "react";
import { BenchmarkRun } from "../types";
import { QUALITY_METRICS, LATENCY_METRICS } from "../lib/metrics";
import { calculateComparison } from "../lib/compare";
import { formatValue } from "../lib/format";

interface Props {
  primary: BenchmarkRun;
  baseline: BenchmarkRun;
}

function BarChart({ def, p, b }: { def: any; p: number | undefined; b: number | undefined }) {
  const max = Math.max(
    p ?? 0,
    b ?? 0,
    def.unit === "percent" ? 1 : 0
  ) || 1;
  const pct = (v: number | undefined) => (v === undefined ? 0 : (v / max) * 100);
  return (
    <div className="chart-row" aria-label={`${def.label}: primary vs baseline`}>
      <div className="chart-row__label">{def.short}</div>
      <div className="bars">
        <div className="bar-group">
          <div className="bar-track" role="img" aria-label={`Primary ${def.label}`}>
            <div className="bar bar--primary" style={{ width: `${pct(p)}%` }} />
          </div>
          <span className="bar-val">{p === undefined ? "N/A" : formatValue(def, p)}</span>
        </div>
        <div className="bar-group">
          <div className="bar-track" role="img" aria-label={`Baseline ${def.label}`}>
            <div className="bar bar--baseline" style={{ width: `${pct(b)}%` }} />
          </div>
          <span className="bar-val">{b === undefined ? "N/A" : formatValue(def, b)}</span>
        </div>
      </div>
    </div>
  );
}

export function ComparisonSection({ primary, baseline }: Props) {
  const qualityCmp = useMemo(
    () =>
      QUALITY_METRICS.map((def) => ({
        def,
        c: calculateComparison(def, def.read(primary.metrics), def.read(baseline.metrics)),
      })),
    [primary, baseline]
  );
  const latencyCmp = useMemo(
    () =>
      LATENCY_METRICS.map((def) => ({
        def,
        c: calculateComparison(def, def.read(primary.metrics), def.read(baseline.metrics)),
      })),
    [primary, baseline]
  );

  return (
    <section className="panel" aria-label="Comparison">
      <h2>Comparison</h2>
      <p className="subtitle">
        Green = better for that direction. Quality metrics: <strong>higher is better</strong>. Latency metrics:{" "}
        <strong>lower is better</strong>. Text labels and arrows indicate the direction; do not rely on color alone.
      </p>

      <div className="comparison-grid">
        <div className="cmp-block">
          <h3>Quality metrics</h3>
          {qualityCmp.map(({ def, c }) => (
            <div
              key={def.key}
              className={`cmp-item cmp-item--${c.classification}`}
            >
              <BarChart def={def} p={c.primary} b={c.baseline} />
              <span className="cmp-sign">
                {c.incomplete
                  ? "—"
                  : c.classification === "improvement"
                    ? c.direction === "higher"
                      ? "▲ better"
                      : "▼ better"
                    : c.classification === "regression"
                      ? c.direction === "higher"
                        ? "▼ worse"
                        : "▲ worse"
                      : "● same"}
              </span>
            </div>
          ))}
        </div>
        <div className="cmp-block">
          <h3>Latency metrics (lower is better)</h3>
          {latencyCmp.map(({ def, c }) => (
            <div key={def.key} className={`cmp-item cmp-item--${c.classification}`}>
              <BarChart def={def} p={c.primary} b={c.baseline} />
              <span className="cmp-sign">
                {c.incomplete
                  ? "—"
                  : c.classification === "improvement"
                    ? "▼ faster"
                    : c.classification === "regression"
                      ? "▲ slower"
                      : "● same"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <h3 className="meta-head">Run metadata</h3>
      <div className="meta-compare">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Primary</th>
              <th>Baseline</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Run", (r: BenchmarkRun) => r.name ?? r.id],
              ["Created", (r: BenchmarkRun) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : "N/A")],
              ["Branch", (r: BenchmarkRun) => r.branch ?? "N/A"],
              ["Commit", (r: BenchmarkRun) => r.commitSha ?? "N/A"],
              ["Dataset", (r: BenchmarkRun) => r.datasetVersion ?? "N/A"],
              ["Model", (r: BenchmarkRun) => r.model ?? "N/A"],
              ["Embedding", (r: BenchmarkRun) => r.embeddingModel ?? "N/A"],
              ["Reranker", (r: BenchmarkRun) => r.reranker ?? "N/A"],
              ["Retrieval", (r: BenchmarkRun) => r.retrievalStrategy ?? "N/A"],
              ["Chunking", (r: BenchmarkRun) => r.chunkingStrategy ?? "N/A"],
              ["Top-K", (r: BenchmarkRun) => r.topK ?? "N/A"],
              ["Environment", (r: BenchmarkRun) => r.environment ?? "N/A"],
            ].map(([label, fn]) => (
              <tr key={label as string}>
                <th>{label as string}</th>
                <td>{(fn as any)(primary)}</td>
                <td>{(fn as any)(baseline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
