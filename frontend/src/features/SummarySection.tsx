import { useMemo } from "react";
import { BenchmarkRun } from "../types";
import { ALL_METRIC_DEFS } from "../lib/metrics";
import { calculateComparison } from "../lib/compare";
import { MetricCard } from "../components/MetricCard";

interface Props {
  runs: BenchmarkRun[];
  primary: BenchmarkRun | undefined;
  baseline: BenchmarkRun | undefined;
}

export function SummarySection({ runs, primary, baseline }: Props) {
  const comparisons = useMemo(() => {
    if (!primary || !baseline) return [];
    const p = primary.metrics;
    const b = baseline.metrics;
    return ALL_METRIC_DEFS.map((def) => ({
      def,
      c: calculateComparison(def, def.read(p), def.read(b)),
    }));
  }, [primary, baseline]);

  if (!primary || !baseline) {
    return (
      <section className="panel" aria-label="Summary">
        <h2>Summary</h2>
        <p className="hint">Select two different runs to see a comparison.</p>
        <p className="hint">Total runs available: {runs.length}</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Summary">
      <div className="section-head">
        <h2>Summary</h2>
        <p className="subtitle">
          Comparing <strong>{primary.name ?? primary.id}</strong> (primary) vs.{" "}
          <strong>{baseline.name ?? baseline.id}</strong> (baseline).<br />
          <span className="legend">Quality: higher is better · Latency / failures / cost: lower is better.</span>
        </p>
      </div>
      <div className="grid metric-grid">
        {comparisons.map(({ def, c }) => (
          <MetricCard key={def.key} def={def} c={c} primaryId={primary.id} baselineId={baseline.id} />
        ))}
      </div>
    </section>
  );
}
