import fs from "node:fs";
import path from "node:path";

/** Tiny JSONL append/read helpers for the admin state store. */

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function appendRow(file: string, row: object): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(row as Record<string, unknown>) + "\n", "utf8");
}

export function readRows<T = Record<string, unknown>>(file: string, limit = 10000): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* skip malformed line */
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Replace the whole file atomically (write temp + rename). */
export function writeRows<T = Record<string, unknown>>(file: string, rows: T[]): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export function id(): string {
  return `${Date.now().toString(16)}-${randomHex(8)}`;
}

export function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}