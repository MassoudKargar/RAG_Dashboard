import { ensureDir, appendRow, readRows } from "./store.js";
import path from "node:path";
import fs from "node:fs";

/** Append-only audit log (JSONL). Never editable through the API. */

export type AuditAction =
  | "login"
  | "logout"
  | "login_failed"
  | "overview"
  | "doc.list"
  | "doc.view"
  | "doc.upload"
  | "doc.update"
  | "doc.replace"
  | "doc.reprocess"
  | "doc.reindex"
  | "doc.archive"
  | "doc.restore"
  | "doc.delete"
  | "doc.soft_delete"
  | "chunk.list"
  | "collection.create"
  | "collection.verify"
  | "collection.snapshot"
  | "collection.reindex"
  | "collection.delete"
  | "search"
  | "rag_query"
  | "job.retry"
  | "job.cancel"
  | "config.validate"
  | "config.test"
  | "config.apply"
  | "config.rollback"
  | "prompt.create"
  | "prompt.activate"
  | "prompt.rollback"
  | "benchmark.note"
  | "audit.view"
  | "system";

export interface AuditEvent {
  ts: string;
  userId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  result: "ok" | "error" | "denied" | "pending";
  corrId: string;
  before?: string; // sanitized before-summary
  after?: string; // sanitized after-summary
  ip?: string;
  message?: string;
}

export class Auditor {
  private file: string;
  private corrId: string;

  constructor(dir: string, corrId = "console") {
    ensureDir(dir);
    this.file = path.join(dir, "audit.jsonl");
    this.corrId = corrId;
  }

  record(
    e: Omit<AuditEvent, "ts" | "corrId"> & { corrId?: string },
    fallbackCorrId?: string
  ): void {
    const row: Record<string, unknown> = { ...e };
    row.ts = new Date().toISOString();
    row.corrId = e.corrId ?? fallbackCorrId ?? this.corrId;
    appendRow(this.file, row);
  }
  list(opts: { limit?: number; offset?: number; action?: string; userId?: string } = {}): {
    total: number;
    items: AuditEvent[];
  } {
    const all = readRows<AuditEvent>(this.file, 20000);
    let items = all.reverse();
    if (opts.action) items = items.filter((e) => e.action === opts.action);
    if (opts.userId) items = items.filter((e) => e.userId === opts.userId);
    const offset = opts.offset ?? 0;
    return { total: items.length, items: items.slice(offset, offset + (opts.limit ?? 50)) };
  }

  /** Total stored (for the overview counter). */
  count(): number {
    if (!fs.existsSync(this.file)) return 0;
    return fs.readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim()).length;
  }
}