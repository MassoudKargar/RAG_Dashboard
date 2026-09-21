import { BenchMetric, RunMetrics } from "./types.js";

/**
 * Numeric guards. Invalid numeric inputs are reported (never silently coerced
 * to 0). "Missing" stays missing (undefined), which the UI renders as
 * "Not available".
 */

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isNonNegativeNumber(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0;
}

export function isNonNegativeInt(v: unknown): v is number {
  return isNonNegativeNumber(v) && Number.isInteger(v);
}

/**
 * Convert a raw value into a non-negative finite number, or undefined if it is
 * missing or malformed. Does NOT convert 96 -> 0.96: percentage-unit conversion
 * must be expressed by the upstream adapter, never guessed here.
 */
export function toNonNegativeNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw === "number") return isNonNegativeNumber(raw) ? raw : undefined;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return undefined;
    const n = Number(s);
    return isNonNegativeNumber(n) ? n : undefined;
  }
  return undefined;
}

export function toNonNegativeInt(raw: unknown): number | undefined {
  const n = toNonNegativeNumber(raw);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** 0..1 quality metric window. NaN/Infinity/out-of-range are invalid (undefined). */
const QUALITY_RANGE: Record<BenchMetric, boolean> = {
  exactAt1: true,
  exactAt5: true,
  exactAt10: true,
  mrr: true,
  persianAt5: true,
  yearAttribution: true,
  semantic: true,
  multiyear: true,
  cacheHitRate: true,
};

export function isQualityMetric(m: BenchMetric): boolean {
  return QUALITY_RANGE[m] === true;
}

export function toQuality(raw: unknown): number | undefined {
  const n = toNonNegativeNumber(raw);
  if (n === undefined) return undefined;
  // Values outside [0,1] are invalid for quality metrics (do not silently clamp).
  return n <= 1 ? n : undefined;
}

export function toLatencyMs(raw: unknown): number | undefined {
  return toNonNegativeNumber(raw);
}

export function toCount(raw: unknown): number | undefined {
  return toNonNegativeInt(raw);
}

export function toSafeId(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  return s.length > 0 ? s.slice(0, 200) : undefined;
}

export function toOptionalString(raw: unknown, max = 500): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  // Objects/arrays (e.g. nested environment dicts) must stay missing, never
  // stringified into garbage like "[object Object]".
  if (typeof raw === "object") return undefined;
  const s = String(raw).trim();
  return s.length > 0 ? s.slice(0, max) : undefined;
}

export function toOptionalInt(raw: unknown): number | undefined {
  return toNonNegativeInt(raw);
}

/** Mark fields whose raw values were present-but-invalid. */
export function collectInvalid(
  run: RunMetrics,
  raw: unknown
): string[] {
  const invalids: string[] = [];
  const rm = run as Record<string, number | undefined>;
  const rg = raw as Record<string, unknown>;
  for (const key of Object.keys(QUALITY_RANGE)) {
    if (rg[key] !== undefined && rg[key] !== null && rm[key] === undefined) {
      invalids.push(key);
    }
  }
  return invalids;
}
