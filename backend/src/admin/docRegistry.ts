import { readRows, appendRow } from "./store.js";
import { ensureDir } from "./store.js";
import fs from "node:fs";
import path from "node:path";

/**
 * Document registry (server-side state complementing the production vector
 * store). This is NOT the source of truth for retrieval — the vector store is.
 * It records file-level facts the RAG metadata store does not persist:
 * original filename, storage location type, checksum, version, status,
 * ingestion summaries, and audit linkage.
 */

export type DocStatus = "indexed" | "pending" | "failed" | "archived" | "soft_deleted" | "deleted";

export interface DocRecord {
  documentId: string;
  title?: string;
  originalFilename?: string;
  mime?: string;
  size?: number;
  checksum?: string;
  storage?: string; // storage location type, e.g. "rag-vector-store + console uploads volume"
  source?: string;
  collection?: string;
  tags?: string[];
  language?: string;
  version: number;
  status: DocStatus;
  chunkCount?: number;
  embeddingModel?: string;
  createdAt: string;
  updatedAt: string;
  lastIndexedAt?: string;
  lastError?: string;
  pendingJobId?: string;
  uploadedBy?: string;
  ext?: string;
  uploadedPath?: string; // server-side storage path (never exposed raw to UI)
  ingestSummary?: Record<string, unknown>;
}

export class DocRegistry {
  private file: string;
  private uploadsDir: string;

  constructor(rootDir: string) {
    const dir = path.join(rootDir, "docs");
    ensureDir(dir);
    this.uploadsDir = path.join(rootDir, "uploads");
    ensureDir(this.uploadsDir);
    this.file = path.join(dir, "documents.jsonl");
  }

  list(): DocRecord[] {
    return readRows<DocRecord>(this.file).reverse();
  }

  get(documentId: string): DocRecord | undefined {
    return this.list().find((d) => d.documentId === documentId);
  }

  getByChecksum(checksum: string): DocRecord | undefined {
    return this.list().find((d) => d.checksum === checksum);
  }

  upsert(rec: DocRecord): void {
    const rows = readRows<DocRecord>(this.file);
    // Rewrite the file to replace an existing entry (same documentId).
    const next = rows.map((r) => (r.documentId === rec.documentId ? rec : r));
    if (!next.some((r) => r.documentId === rec.documentId)) next.push(rec);
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, next.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    fs.renameSync(tmp, this.file);
  }

  update(documentId: string, patch: Partial<DocRecord>): DocRecord | undefined {
    const cur = this.get(documentId);
    if (!cur) return undefined;
    const next: DocRecord = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    this.upsert(next);
    return next;
  }

  uploadsDirPath(): string {
    return this.uploadsDir;
  }
}