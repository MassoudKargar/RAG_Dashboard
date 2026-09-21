/**
 * Structured minimal logger. Never writes secrets, tokens, or env values.
 */
export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {}
): void {
  const line = { ts: new Date().toISOString(), level, msg, ...fields };
  // eslint-disable-next-line no-console
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](JSON.stringify(line));
}