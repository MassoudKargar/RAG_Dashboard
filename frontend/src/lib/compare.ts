import { MetricDef } from "./metrics";

export type Direction = "improvement" | "regression" | "no_change";

export interface Comparison {
  key: string;
  label: string;
  short: string;
  unit: string;
  direction: "higher" | "lower";
  primary?: number;
  baseline?: number;
  absoluteDelta?: number;
  /** Relative percent delta. Only computed when the baseline is non-zero. */
  relativePercent?: number;
  relativeUnavailable: boolean;
  classification: "improvement" | "regression" | "no_change" | "incomplete";
  /** True when either side is missing. Do NOT treat missing as zero. */
  incomplete: boolean;
  /** Accessible textual status. */
  statusText: string;
}

/**
 * Higher-is-better:
 *   absoluteDelta = primary - baseline
 *   relativeDeltaPercent = baseline != 0 ? ((primary-baseline)/abs(baseline))*100 : unavailable
 *   positive absolute delta = improvement
 *
 * Lower-is-better (latency, failures, duration, tokens, cost):
 *   rawDelta = primary - baseline
 *   improvementPercent = baseline > 0 ? ((baseline-primary)/baseline)*100 : unavailable
 *   negative raw delta = improvement
 */
export function calculateComparison(
  def: MetricDef,
  primary?: number,
  baseline?: number
): Comparison {
  const base: Comparison = {
    key: def.key,
    label: def.label,
    short: def.short,
    unit: def.unit,
    direction: def.direction,
    primary,
    baseline,
    relativeUnavailable: true,
    classification: "incomplete",
    incomplete: true,
    statusText: "Incomplete",
  };

  // Never compare missing data; never treat missing as zero.
  if (primary === undefined || baseline === undefined) {
    if (primary !== undefined || baseline !== undefined) {
      base.classification = "incomplete";
      base.statusText = "Not comparable (missing data)";
    }
    return base;
  }

  base.incomplete = false;
  const abs = primary - baseline;

  if (def.direction === "higher") {
    base.absoluteDelta = abs;
    if (baseline !== 0) {
      base.relativePercent = (abs / Math.abs(baseline)) * 100;
      base.relativeUnavailable = false;
    }
    if (abs > 0) base.classification = "improvement";
    else if (abs < 0) base.classification = "regression";
    else base.classification = "no_change";
  } else {
    base.absoluteDelta = abs;
    if (baseline > 0) {
      base.relativePercent = ((baseline - primary) / baseline) * 100;
      base.relativeUnavailable = false;
    }
    if (abs < 0) base.classification = "improvement";
    else if (abs > 0) base.classification = "regression";
    else base.classification = "no_change";
  }

  base.statusText = humanStatus(base);
  return base;
}

export function humanStatus(c: Comparison): string {
  if (c.incomplete) return "Not comparable";
  switch (c.classification) {
    case "improvement":
      return c.direction === "higher" ? "Improvement (higher is better)" : "Improvement (lower is better)";
    case "regression":
      return c.direction === "higher" ? "Regression (higher is better)" : "Regression (lower is better)";
    case "no_change":
      return "No change";
    default:
      return "Not comparable";
  }
}
