import path from "node:path";
import fs from "node:fs";
import { readRows, appendRow, ensureDir } from "./store.js";

/** Data directory layout for the admin console (persistent, server-side). */
export interface DataDirs {
  root: string;
  uploads: string; // original source files (server-side names)
  audit: string;
  jobs: string;
  docs: string;
  users: string;
  config: string;
  prompts: string;
  benchmarks: string;
}

export function makeDirs(root: string): DataDirs {
  const d: DataDirs = {
    root,
    uploads: path.join(root, "uploads"),
    audit: path.join(root, "audit"),
    jobs: path.join(root, "jobs"),
    docs: path.join(root, "docs"),
    users: path.join(root, "users"),
    config: path.join(root, "config"),
    prompts: path.join(root, "prompts"),
    benchmarks: path.join(root, "benchmarks"),
  };
  for (const v of Object.values(d)) ensureDir(v);
  return d;
}

/** Server-side sanitized storage name: never expose/trust the client filename on disk. */
export function storageName(docId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? ext.toLowerCase() : "txt";
  return `${docId}.${safeExt}`;
}

export function readJsonl<T>(file: string): T[] {
  return readRows<T>(file);
}

export function appendJsonl(file: string, row: Record<string, unknown>): void {
  appendRow(file, row);
}

export function writeJsonl<T>(file: string, rows: T[]): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  fs.renameSync(tmp, file);
}