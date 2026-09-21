import { MetricDef } from "./metrics";

/** Not available when a value is missing. Round only for display. */
export function formatValue(def: MetricDef, v?: number): string {
  if (v === undefined) return "Not available";
  switch (def.unit) {
    case "percent":
      return `${(v * 100).toFixed(1)}%`;
    case "3dp":
      return v.toFixed(3);
    case "ms":
      return `${v.toFixed(0)} ms`;
    case "count":
      return v.toLocaleString();
    case "cost":
      return `$${v.toFixed(4)}`;
    case "duration":
      return formatDuration(v);
    default:
      return String(v);
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Format a latency that may exceed 1000ms, with seconds as secondary text. */
export function formatLatency(ms: number): { primary: string; secondary?: string } {
  if (ms >= 1000) {
    return { primary: `${ms.toFixed(0)} ms`, secondary: `${(ms / 1000).toFixed(2)} s` };
  }
  return { primary: `${ms.toFixed(0)} ms` };
}

export function formatDelta(def: MetricDef, delta?: number): string {
  if (delta === undefined) return "Not available";
  switch (def.unit) {
    case "percent":
      return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`;
    case "3dp":
      return `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`;
    case "ms":
      return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)} ms`;
    case "count":
      return `${delta >= 0 ? "+" : ""}${delta.toLocaleString()}`;
    case "cost":
      return `${delta >= 0 ? "+" : ""}$${delta.toFixed(4)}`;
    case "duration":
      return `${delta >= 0 ? "+" : ""}${formatDuration(delta)}`;
    default:
      return String(delta);
  }
}

export function formatRelative(rel?: number, unavailable?: boolean): string {
  if (unavailable || rel === undefined) return "Not available";
  return `${rel >= 0 ? "+" : ""}${rel.toFixed(1)}%`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "Not available";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not available";
  return d.toLocaleString();
}

export function truncate(s: string | undefined, max = 16): string {
  if (!s) return "—";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
