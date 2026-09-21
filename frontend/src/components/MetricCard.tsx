import { Comparison } from "../lib/compare";
import { MetricDef } from "../lib/metrics";
import { formatDelta, formatRelative, formatValue } from "../lib/format";

interface Props {
  def: MetricDef;
  c: Comparison;
  primaryId: string;
  baselineId: string;
}

export function MetricCard({ def, c, primaryId, baselineId }: Props) {
  const badge =
    c.incomplete
      ? { cls: "badge incomplete", label: "Not comparable" }
      : c.classification === "improvement"
        ? { cls: "badge improvement", label: c.direction === "higher" ? "▲ Improvement" : "▼ Improvement" }
        : c.classification === "regression"
          ? { cls: "badge regression", label: c.direction === "higher" ? "▼ Regression" : "▲ Regression" }
          : { cls: "badge nochange", label: "● No change" };

  return (
    <article className="metric-card" aria-label={`${def.label} comparison`}>
      <header className="metric-card__head">
        <h3 className="metric-card__title">{def.label}</h3>
        <span className={`${badge.cls}`} role="status">
          {badge.label}
        </span>
      </header>
      <div className="metric-card__values">
        <div className="metric-value" title={`${primaryId}`}>
          <span className="metric-value__label">Primary ({primaryId})</span>
          <span className="metric-value__num">
            {c.primary === undefined ? "Not available" : formatValue(def, c.primary)}
          </span>
          {c.primary !== undefined && def.unit === "ms" && c.primary >= 1000 && (
            <span className="metric-value__sub">{(c.primary / 1000).toFixed(2)} s</span>
          )}
        </div>
        <div className="metric-value" title={`${baselineId}`}>
          <span className="metric-value__label">Baseline ({baselineId})</span>
          <span className="metric-value__num">
            {c.baseline === undefined ? "Not available" : formatValue(def, c.baseline)}
          </span>
          {c.baseline !== undefined && def.unit === "ms" && c.baseline >= 1000 && (
            <span className="metric-value__sub">{(c.baseline / 1000).toFixed(2)} s</span>
          )}
        </div>
      </div>
      <dl className="metric-card__delta">
        <div>
          <dt>Absolute Δ</dt>
          <dd>{formatDelta(def, c.absoluteDelta)}</dd>
        </div>
        <div>
          <dt>Relative Δ</dt>
          <dd>{formatRelative(c.relativePercent, c.relativeUnavailable)}</dd>
        </div>
      </dl>
      <p className={`sr-only`}>{c.statusText}</p>
    </article>
  );
}
