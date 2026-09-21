import { ensureDir } from "./store.js";
import { readRows, appendRow, writeRows, id } from "./store.js";
import path from "node:path";
import fs from "node:fs";

/**
 * Persistent job store for ingestion/maintenance jobs.
 * Single-file JSONL; statuses follow the console's job state machine:
 * queued -> validating -> parsing -> chunking -> embedding -> indexing ->
 * completed | partially_completed | failed | cancelled | rolling_back
 */

export type JobStatus =
  | "queued"
  | "validating"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexing"
  | "verifying"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled"
  | "rolling_back";

export interface Job {
  id: string;
  type: "upload" | "reprocess" | "reindex" | "delete" | "snapshot" | "verify" | "config" | "benchmark";
  documentId?: string;
  file?: string;
  checksum?: string;
  idempotencyKey?: string;
  status: JobStatus;
  stage?: string;
  progress?: number;
  retryCount: number;
  initiator: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorSummary?: string;
  result?: Record<string, unknown>;
  auditCorrId?: string;
}

export class JobStore {
  private file: string;

  constructor(dir: string) {
    ensureDir(dir);
    this.file = path.join(dir, "jobs.jsonl");
  }

  list(): Job[] {
    return readRows<Job>(this.file).reverse();
  }

  get(jobId: string): Job | undefined {
    return readRows<Job>(this.file).find((j) => j.id === jobId);
  }

  create(j: Omit<Job, "id" | "createdAt" | "status" | "retryCount">): Job {
    const job: Job = {
      ...j,
      id: id(),
      status: "queued",
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };
    appendRow(this.file, job);
    return job;
  }

  update(jobId: string, patch: Partial<Job>): Job | undefined {
    const rows = readRows<Job>(this.file);
    let updated: Job | undefined;
    const next = rows.map((j) => {
      if (j.id !== jobId) return j;
      updated = { ...j, ...patch };
      return updated;
    });
    if (updated) writeRows(this.file, next);
    return updated;
  }

  snapshotRows(): Job[] {
    return readRows<Job>(this.file);
  }
}