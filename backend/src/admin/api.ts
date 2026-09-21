import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import busboy from "busboy";
import { loadConfig } from "../config.js";
import { Auth } from "./auth.js";
import { Auditor } from "./audit.js";
import { makeDirs } from "./dirs.js";
import { JobStore } from "./jobs.js";
import { DocRegistry } from "./docRegistry.js";
import { RagClient } from "./ragClient.js";
import { extractText, sniffMime, allowedExtension } from "./textExtract.js";
import { randomHex } from "./store.js";

/**
 * RAG Administration Console - backend router (mounted under /api/auth and /api/admin).
 *
 * Security model:
 *  - /api/auth/login is public; everything else requires a session.
 *  - Every authenticated action is audited (append-only).
 *  - The RAG API key lives only in this process; never sent to the browser.
 *  - Destructive ops require typed confirmation; mutations require CSRF.
 */

// Minimal structural types matching http.IncomingMessage / http.ServerResponse.
export type ReqLike = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { encrypted?: boolean; remoteAddress?: string };
  on(ev: string, cb: (chunk?: unknown) => void): void;
} & NodeJS.ReadableStream;

export type ResLike = {
  setHeader(k: string, v: string | string[]): void;
  writeHead(s: number, h?: Record<string, string | number | string[]>): unknown;
  end(b?: string): unknown;
};

export interface AdminContext {
  cfg: ReturnType<typeof loadConfig>;
  auth: Auth;
  audit: Auditor;
  dirs: ReturnType<typeof makeDirs>;
  jobs: JobStore;
  docs: DocRegistry;
  rag: RagClient;
}

function securityUsername(s: string): boolean {
  return s.length === 0 || s.length > 64 || !/^[A-Za-z0-9._-]+$/.test(s);
}

function containsBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0x00) return true;
  return false;
}

export function createAdmin(): AdminContext {
  const cfg = loadConfig();
  const dirs = makeDirs(cfg.adminDataDir);
  const audit = new Auditor(dirs.audit);
  const auth = new Auth(dirs.users, cfg.sessionTtlMinutes, cfg.loginMaxAttempts, cfg.loginWindowMinutes);
  const jobs = new JobStore(dirs.jobs);
  const docs = new DocRegistry(dirs.root);
  const rag = new RagClient({ baseUrl: cfg.ragApiUrl, apiKey: cfg.ragApiKey });
  const ctx: AdminContext = { cfg, auth, audit, dirs, jobs, docs, rag };

  const boot = auth.bootstrapAdmin(cfg.adminUsername, process.env.ADMIN_PASSWORD);
  if (boot.generated) {
    try {
      const pwPath = path.join(cfg.adminDataDir, ".admin-password");
      fs.writeFileSync(pwPath, `${cfg.adminUsername}\n${boot.generated}\n`, { mode: 0o600 });
      fs.chmodSync(pwPath, 0o600);
    } catch {
      /* non-fatal */
    }
  }
  return ctx;
}

function textOk(res: ResLike, status: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  (res.writeHead as (s: number) => void)(status);
  res.end(body);
}

function readBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: unknown) => chunks.push(Buffer.from(c as ArrayBuffer)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function jsonBody(req: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  const buf = await readBody(req);
  try {
    return (JSON.parse(buf.toString("utf8")) as unknown) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function header(req: ReqLike, name: string): string | undefined {
  const v = req.headers?.[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

function getCookie(req: ReqLike, name: string): string | undefined {
  const cookie = header(req, "cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

function isSecure(req: ReqLike): boolean {
  return header(req, "x-forwarded-proto") === "https" || Boolean(req.socket?.encrypted);
}

function setSessionCookies(res: ResLike, token: string, csrf: string, secure: boolean): void {
  const flag = secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `rd_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${flag}`,
    `rd_csrf=${csrf}; SameSite=Strict; Path=/; Max-Age=28800${flag}`,
  ]);
}

function clearSessionCookies(res: ResLike): void {
  res.setHeader("Set-Cookie", [
    "rd_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    "rd_csrf=; SameSite=Strict; Path=/; Max-Age=0",
  ]);
}

function clientIp(req: ReqLike): string {
  const fwd = header(req, "x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.socket?.remoteAddress ?? "unknown").slice(0, 64);
}

function parseUpload(req: ReqLike, maxBytes: number, maxFiles: number) {
  const bb = (busboy as unknown as (r: unknown, o: Record<string, unknown>) => {
    on: (e: string, cb: (...a: any[]) => void) => void;
  })(req as unknown as NodeJS.ReadableStream, {
    limits: { fileSize: maxBytes, files: maxFiles, fields: 20, fieldSize: 1024 * 1024 },
  });
  return new Promise<{ fields: Record<string, string>; files: Array<{ name: string; filename?: string; mime: string; data: Buffer }> }>(
    (resolve, reject) => {
      const fields: Record<string, string> = {};
      const files: Array<{ name: string; filename?: string; mime: string; data: Buffer }> = [];
      bb.on("field", (name: string, val: string) => { fields[name] = val; });
      bb.on("file", (name: string, file: NodeJS.ReadableStream, info: { filename?: string; mimeType?: string }) => {
        const chunks: Buffer[] = [];
        file.on("data", (d: unknown) => chunks.push(Buffer.from(d as ArrayBuffer)));
        file.on("limit", () => reject(new Error("Upload exceeds the configured size limit")));
        file.on("end", () => files.push({ name, filename: info?.filename, mime: info?.mimeType ?? "", data: Buffer.concat(chunks) }));
      });
      bb.on("error", (e: Error) => reject(new Error(String(e?.message ?? "upload parse error"))));
      bb.on("finish", () => resolve({ fields, files }));
    }
  );
}

function checksum(buf: Buffer): string {
  const g = crypto.createHash("sha256");
  g.update(buf);
  return Buffer.from(g.digest()).toString("hex");
}

function filenameFor(rec: { originalFilename?: string; documentId?: string } | undefined): string {
  return rec?.originalFilename ?? rec?.documentId ?? "document.txt";
}

export function handleAdmin(req: ReqLike, res: ResLike, ctx: AdminContext): boolean | void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const method = (req.method ?? "GET").toUpperCase();
  const { auth, audit, cfg, dirs, jobs, docs, rag } = ctx;
  const ip = clientIp(req);

  const ok = (obj: unknown, status = 200) => textOk(res, status, obj);
  const fail = (status: number, message: string) => textOk(res, status, { error: message });

  // ------------------------------------------------------------------
  // AUTH (public login)
  // ------------------------------------------------------------------
  if (p === "/api/auth/login" && method === "POST") {
    void (async () => {
      const body = await jsonBody(req);
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      if (securityUsername(username)) {
        audit.record({ userId: username, action: "login_failed", result: "denied", ip, message: "invalid username format" });
        return ok({ error: "Invalid request" }, 400);
      }
      const attempt = auth.login(username, password, ip);
      if (!attempt.ok) {
        audit.record({ userId: username, action: "login_failed", result: "denied", ip, message: attempt.reason });
        const status = attempt.reason === "locked" ? 429 : 401;
        return ok({ error: attempt.reason === "locked" ? "Account temporarily locked" : "Invalid credentials" }, status);
      }
      audit.record({ userId: username, action: "login", result: "ok", ip });
      setSessionCookies(res, attempt.rawToken!, attempt.session!.csrf, isSecure(req));
      return ok({ username, role: attempt.session!.role });
    })();
    return;
  }
  if (p === "/api/auth/logout" && method === "POST") {
    const tok = getCookie(req, "rd_session") ?? "";
    const sess = auth.sessionForToken(tok);
    audit.record({ userId: sess?.username ?? "unknown", action: "logout", result: "ok", ip });
    auth.logout(tok);
    clearSessionCookies(res);
    return ok({ ok: true });
  }
  if (p === "/api/auth/me") {
    const tok = getCookie(req, "rd_session") ?? "";
    const sess = auth.sessionForToken(tok);
    if (!sess) return ok({ authenticated: false }, 401);
    audit.record({ userId: sess.username, action: "system", resourceType: "session", result: "ok", ip });
    return ok({ authenticated: true, username: sess.username, role: sess.role });
  }

  // Everything below requires a session.
  const sessionToken = getCookie(req, "rd_session") ?? "";
  const session = auth.sessionForToken(sessionToken);
  if (!session) return ok({ error: "Authentication required" }, 401);

  const csrfHeader = header(req, "x-csrf-token") ?? "";
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (isMutation && !auth.csrfValid(session, csrfHeader)) {
    audit.record({ userId: session.username, action: "system", resourceType: "csrf", result: "denied", ip, message: "CSRF validation failed" });
    return ok({ error: "CSRF validation failed" }, 403);
  }

  const user = session.username;
  const corrId = randomHex(8);

  if (session.role !== "admin") {
    audit.record({ userId: user, action: "system", resourceType: "role", result: "denied", ip });
    return ok({ error: "Administrator role required" }, 403);
  }

  // ------------------------------------------------------------------
  // OVERVIEW / HEALTH
  // ------------------------------------------------------------------
  if (p === "/api/admin/overview" && method === "GET") {
    void (async () => {
      audit.record({ userId: user, action: "overview", result: "ok", ip, corrId });
      let ragStats: Record<string, unknown> | undefined;
      let ragErr: string | undefined;
      try { ragStats = await rag.adminStats(); } catch (e) { ragErr = (e as Error).message; }
      const docsList = docs.list();
      const jobsList = jobs.list();
      return ok({
        rag: { reachable: !ragErr, error: ragErr ?? undefined, stats: ragStats },
        registry: {
          documents: docsList.length,
          totalChunks: docsList.reduce((a, d) => a + (d.chunkCount ?? 0), 0),
          byStatus: docsList.reduce((acc, d) => { acc[d.status] = (acc[d.status] ?? 0) + 1; return acc; }, {} as Record<string, number>),
        },
        jobs: {
          total: jobsList.length,
          queued: jobsList.filter((j) => j.status === "queued").length,
          inFlight: jobsList.filter((j) => ["validating", "parsing", "chunking", "embedding", "indexing", "verifying"].includes(j.status)).length,
          failed: jobsList.filter((j) => j.status === "failed").length,
          completed: jobsList.filter((j) => j.status === "completed").length,
          latest: jobsList.slice(0, 8).map((j) => ({ id: j.id, type: j.type, documentId: j.documentId, status: j.status, createdAt: j.createdAt })),
        },
        auditCount: audit.count(),
      });
    })();
    return;
  }

  if (p === "/api/admin/health" && method === "GET") {
    void (async () => {
      const services: Record<string, string> = { dashboard: "ok" };
      try { await rag.health(); services.rag_api = "ok"; } catch { services.rag_api = "unreachable"; }
      return ok({ status: "ok", services });
    })();
    return;
  }

  // ------------------------------------------------------------------
  // DOCUMENTS
  // ------------------------------------------------------------------
  if (p === "/api/admin/documents" && method === "GET") {
    void (async () => {
      audit.record({ userId: user, action: "doc.list", result: "ok", ip, corrId });
      let ragDocs: unknown[] = [];
      let ragErr: string | undefined;
      try { const rd = await rag.adminDocuments(); ragDocs = (rd.documents as unknown[]) ?? []; }
      catch (e) { ragErr = (e as Error).message; }
      return ok({
        rag: { reachable: !ragErr, error: ragErr ?? undefined, documents: ragDocs },
        registry: docs.list(),
      });
    })();
    return;
  }

  const chunksMatch = p.match(/^\/api\/admin\/documents\/([^/]+)\/chunks$/);
  if (chunksMatch && method === "GET") {
    const documentId = decodeURIComponent(chunksMatch[1]);
    void (async () => {
      audit.record({ userId: user, action: "chunk.list", resourceType: "document", resourceId: documentId, result: "ok", ip, corrId });
      try {
        const res = await rag.adminChunks(documentId, 2000) as { total_chunks?: number; chunks?: unknown[] };
        return ok({ documentId, totalChunks: res.total_chunks ?? 0, chunks: res.chunks ?? [] });
      } catch (e) { return fail(502, (e as Error).message); }
    })();
    return;
  }

  const docGet = p.match(/^\/api\/admin\/documents\/([^/]+)$/);
  if (docGet && method === "GET") {
    const documentId = decodeURIComponent(docGet[1]);
    void (async () => {
      audit.record({ userId: user, action: "doc.view", resourceType: "document", resourceId: documentId, result: "ok", ip, corrId });
      const rec = docs.get(documentId);
      let chunks: unknown = null;
      let chunkErr: string | undefined;
      try { chunks = await rag.adminChunks(documentId, 2000); } catch (e) { chunkErr = (e as Error).message; }
      return ok({ document: rec ?? null, chunks, chunkError: chunkErr ?? undefined });
    })();
    return;
  }

  if (p === "/api/admin/documents" && method === "POST") {
    void (async () => {
      const body = await jsonBody(req);
      const text = String(body.text ?? "");
      const source = String(body.source ?? "manual");
      const documentId = String(body.documentId ?? "").trim();
      if (!text.trim()) return fail(400, "text is required");
      if (text.length > cfg.uploadMaxText) return fail(413, "text exceeds the configured limit");
      const targetId = documentId || `manual_${randomHex(8)}`;
      audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: targetId, result: "pending", ip, corrId });
      docs.upsert({
        documentId: targetId, title: String(body.title ?? source), originalFilename: source, source,
        storage: "rag-vector-store + console uploads volume", version: 1, status: "pending",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), uploadedBy: user,
      });
      try {
        const ingested = await rag.ingest(text, source, { document_id: targetId });
        const rec2 = docs.update(targetId, {
          chunkCount: ingested.chunks_added, lastIndexedAt: new Date().toISOString(), status: "indexed",
          embeddingModel: "local (GTE Persian)", ingestSummary: ingested as unknown as Record<string, unknown>,
        });
        audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: targetId, result: "ok", after: `chunks=${ingested.chunks_added}`, ip, corrId });
        return ok({ documentId: targetId, chunksAdded: ingested.chunks_added, record: rec2 }, 201);
      } catch (e) {
        docs.update(targetId, { status: "failed", lastError: (e as Error).message });
        audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: targetId, result: "error", message: (e as Error).message, ip, corrId });
        return fail(502, (e as Error).message);
      }
    })();
    return;
  }

  // ------------------------------------------------------------------
  // UPLOAD (streaming)
  // ------------------------------------------------------------------
  if (p === "/api/admin/upload" && method === "POST") {
    void (async () => {
      try {
        const { fields, files } = await parseUpload(req, cfg.uploadMaxBytes, cfg.uploadMaxBatch);
        const file = files.find((f) => f.name === "file");
        if (!file) return fail(400, "No file provided");
        const safeName = path.basename(file.filename ?? "upload.txt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
        if (containsBinary(new Uint8Array(file.data))) return fail(415, "Binary or non-text content is not accepted");
        const sniffed = sniffMime(new Uint8Array(file.data));
        const ext = path.extname(safeName).toLowerCase().replace(".", "") || "txt";
        if (!allowedExtension(new Uint8Array(file.data), sniffed)) return fail(415, `File type not accepted (${sniffed})`);
        const sha = checksum(file.data);
        const existing = docs.getByChecksum(sha);
        if (existing) {
          audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: existing.documentId, result: "ok", message: "duplicate rejected", ip, corrId });
          return ok({ duplicate: true, documentId: existing.documentId, checksum: sha }, 409);
        }
        const extracted = extractText(sniffed, ext, new Uint8Array(file.data), cfg.uploadMaxText);
        if (!extracted.ok) return fail(415, extracted.reason ?? "unsupported file");

        const documentId = String(fields.document_id ?? "").trim() || `doc_${randomHex(10)}`;
        const storedName = storageServerName(documentId, ext);
        fs.writeFileSync(path.join(dirs.uploads, storedName), file.data, { mode: 0o640 });

        const job = jobs.create({ type: "upload", documentId, file: storedName, checksum: sha, idempotencyKey: sha, initiator: user });
        jobs.update(job.id, { status: "validating", stage: "validating", progress: 5 });

        docs.upsert({
          documentId, title: String(fields.title ?? safeName), originalFilename: safeName, mime: sniffed,
          size: file.data.length, checksum: sha, storage: "rag-vector-store + console uploads volume",
          source: safeName, tags: String(fields.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
          version: 1, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          pendingJobId: job.id, uploadedBy: user, ext, uploadedPath: storedName,
        });

        audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: documentId, result: "ok", ip, corrId, after: `size=${file.data.length} sha=${sha.slice(0, 12)}` });

        try {
          jobs.update(job.id, { status: "parsing", stage: "parsing", progress: 30 });
          jobs.update(job.id, { status: "chunking", stage: "chunking", progress: 50 });
          jobs.update(job.id, { status: "embedding", stage: "embedding", progress: 75 });
          jobs.update(job.id, { status: "indexing", stage: "indexing", progress: 88 });
          const ingested = await rag.ingest(extracted.text!, safeName, {
            document_id: documentId, checksum: sha, mime: sniffed, source: safeName, uploaded_by: user,
          });
          jobs.update(job.id, { status: "verifying", stage: "verifying", progress: 95 });
          const verify = await rag.adminChunks(documentId, 2000) as { total_chunks?: number };
          const chunkCount = verify.total_chunks ?? ingested.chunks_added;
          docs.update(documentId, { chunkCount, embeddingModel: "local (GTE Persian)", status: "indexed", lastIndexedAt: new Date().toISOString(), pendingJobId: undefined, ingestSummary: ingested as unknown as Record<string, unknown> });
          jobs.update(job.id, { status: "completed", progress: 100, finishedAt: new Date().toISOString(), result: { documentId, chunksAdded: chunkCount, chunkIds: ingested.chunk_ids } });
          audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: documentId, result: "ok", after: `chunks=${chunkCount}`, ip, corrId });
          return ok({ jobId: job.id, documentId, chunksAdded: chunkCount, status: "completed" }, 201);
        } catch (e) {
          const msg = (e as Error).message;
          jobs.update(job.id, { status: "rolling_back", stage: "rolling_back", progress: 90, errorSummary: msg });
          try { await rag.adminDeleteDocument(documentId); } catch { /* best effort */ }
          docs.update(documentId, { status: "failed", lastError: msg });
          jobs.update(job.id, { status: "failed", finishedAt: new Date().toISOString(), errorSummary: msg });
          audit.record({ userId: user, action: "doc.upload", resourceType: "document", resourceId: documentId, result: "error", message: msg, ip, corrId });
          return fail(502, msg);
        }
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    })();
    return;
  }

  // Document action endpoints
  const actionMatch = p.match(/^\/api\/admin\/documents\/([^/]+)\/(reprocess|reindex|archive|restore|delete)$/);
  if (actionMatch) {
    const documentId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];
    void (async () => {
      if (action === "delete") {
        const body = await jsonBody(req);
        const expected = `DELETE ${documentId}`;
        if (String(body.confirm ?? "") !== expected) {
          audit.record({ userId: user, action: "doc.delete", resourceType: "document", resourceId: documentId, result: "denied", message: "typed confirmation mismatch", ip, corrId });
          return fail(400, `Typed confirmation mismatch. Expected: ${expected}`);
        }
      }
      audit.record({ userId: user, action: `doc.${action}` as never, resourceType: "document", resourceId: documentId, result: "ok", ip, corrId });
      if (action === "archive") return ok({ documentId, status: docs.update(documentId, { status: "archived" })?.status });
      if (action === "restore") return ok({ documentId, status: docs.update(documentId, { status: "indexed" })?.status });
      if (action === "delete") {
        try {
          await rag.adminDeleteDocument(documentId);
          docs.update(documentId, { status: "deleted" });
          audit.record({ userId: user, action: "doc.delete", resourceType: "document", resourceId: documentId, result: "ok", ip, corrId });
          return ok({ documentId, deleted: true });
        } catch (e) { return fail(502, (e as Error).message); }
      }
      // reprocess / reindex
      const rec = docs.get(documentId);
      if (!rec || !rec.uploadedPath) return fail(404, "Unknown document — upload it via this console first");
      try {
        const job = jobs.create({ type: action === "reindex" ? "reindex" : "reprocess", documentId, initiator: user });
        jobs.update(job.id, { status: "indexing", stage: "indexing", progress: 50 });
        const bytes = fs.readFileSync(path.join(dirs.uploads, rec.uploadedPath));
        const extracted = extractText(rec.mime ?? "text/plain", rec.ext ?? "txt", new Uint8Array(bytes), cfg.uploadMaxText);
        if (!extracted.ok) throw new Error(extracted.reason ?? "re-extraction failed");
        const ingested = await rag.ingest(extracted.text!, filenameFor(rec), { document_id: documentId });
        docs.update(documentId, { chunkCount: ingested.chunks_added, status: "indexed", lastIndexedAt: new Date().toISOString() });
        jobs.update(job.id, { status: "completed", progress: 100, finishedAt: new Date().toISOString(), result: ingested });
        return ok({ jobId: job.id, documentId, chunksAdded: ingested.chunks_added });
      } catch (e) { return fail(502, (e as Error).message); }
    })();
    return;
  }

  // ------------------------------------------------------------------
  // SEARCH / RAG
  // ------------------------------------------------------------------
  if (p === "/api/admin/search" && method === "POST") {
    void (async () => {
      const body = await jsonBody(req);
      const prompt = String(body.prompt ?? "");
      const limit = Number(body.limit ?? 10);
      if (!prompt.trim()) return fail(400, "prompt is required");
      const started = Date.now();
      audit.record({ userId: user, action: "search", resourceType: "search", resourceId: prompt.slice(0, 80), result: "ok", ip, corrId });
      try {
        const results = await rag.searchDocuments(prompt, limit > 0 && limit < 200 ? limit : 10);
        return ok({ results, latencyMs: Date.now() - started, stage: { normalizedQuery: prompt, vectorRetrieval: true } });
      } catch (e) { return fail(502, (e as Error).message); }
    })();
    return;
  }

  if (p === "/api/admin/rag-query" && method === "POST") {
    void (async () => {
      const body = await jsonBody(req);
      const messages = Array.isArray(body.messages) ? (body.messages as Array<{ role: string; content: string }>) : [];
      const model = String(body.model ?? "");
      if (!messages.length) return fail(400, "messages are required");
      const started = Date.now();
      audit.record({ userId: user, action: "rag_query", resourceType: "search", result: "ok", ip, corrId });
      try {
        const chat = await rag.chat(messages, model || undefined);
        return ok({ response: chat, latencyMs: Date.now() - started });
      } catch (e) { return fail(502, (e as Error).message); }
    })();
    return;
  }

  // ------------------------------------------------------------------
  // COLLECTIONS / JOBS / AUDIT / CONFIG / PROMPTS
  // ------------------------------------------------------------------
  if (p === "/api/admin/collections" && method === "GET") {
    void (async () => {
      audit.record({ userId: user, action: "overview", resourceType: "collection", result: "ok", ip, corrId });
      try { const cols = await rag.adminCollections(); return ok(cols); }
      catch (e) { return fail(502, (e as Error).message); }
    })();
    return;
  }

  if (p === "/api/admin/jobs" && method === "GET") {
    audit.record({ userId: user, action: "overview", resourceType: "job", result: "ok", ip, corrId });
    return ok({ jobs: jobs.list().slice(0, 100) });
  }

  const jobMatch = p.match(/^\/api\/admin\/jobs\/([^/]+)\/(retry|cancel)$/);
  if (jobMatch && method === "POST") {
    const jobId = jobMatch[1];
    const action = jobMatch[2];
    const job = jobs.get(jobId);
    if (!job) return fail(404, "Job not found");
    audit.record({ userId: user, action: `job.${action}` as never, resourceType: "job", resourceId: jobId, result: "ok", ip, corrId });
    if (action === "cancel") {
      return ok({ job: jobs.update(jobId, { status: "cancelled", finishedAt: new Date().toISOString() }) });
    }
    if (job.documentId) {
      return ok({ job: jobs.update(jobId, { status: "queued", retryCount: job.retryCount + 1, finishedAt: undefined }) });
    }
    return fail(400, "Retry requires a stored document");
  }

  if (p === "/api/admin/audit" && method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    audit.record({ userId: user, action: "audit.view", result: "ok", ip, corrId });
    return ok(audit.list({ limit: limit > 0 && limit < 500 ? limit : 50, offset: offset > 0 ? offset : 0, action: url.searchParams.get("action") ?? undefined }));
  }

  if (p === "/api/admin/config" && method === "GET") {
    audit.record({ userId: user, action: "config.validate", result: "ok", ip, corrId });
    const names = [
      "PROVIDER", "EMBEDDING_PROVIDER", "CHAT_MODEL", "OPENROUTER_CHAT_MODEL", "LOCAL_EMBEDDING_MODEL",
      "LOCAL_EMBEDDING_API_URL", "CHROMA_PERSIST_DIRECTORY", "RAG_CHUNK_SIZE", "RAG_CHUNK_OVERLAP",
      "RAG_RETRIEVAL_K", "RAG_SEARCH_LIMIT", "RAG_CORPORA_YEARS", "RAG_EMBEDDING_BATCH_SIZE",
    ];
    return ok({
      settings: names.map((name) => ({ name, masked: true, status: "configured" })),
      note: "Values are masked; secrets are never returned to the browser.",
    });
  }

  if (p === "/api/admin/config/test-connection" && method === "POST") {
    void (async () => {
      const checks: Record<string, string> = {};
      try { await rag.health(); checks.rag_api = "ok"; } catch { checks.rag_api = "error"; }
      audit.record({ userId: user, action: "config.test", result: "ok", ip, corrId });
      return ok({ checks });
    })();
    return;
  }

  if (p === "/api/admin/prompts" && method === "GET") {
    audit.record({ userId: user, action: "overview", resourceType: "prompt", result: "ok", ip, corrId });
    const file = path.join(dirs.prompts, "prompts.jsonl");
    const prompts = fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    return ok({ prompts });
  }

  return false;
}

function storageServerName(documentId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? ext.toLowerCase() : "txt";
  return `${documentId.replace(/[^a-zA-Z0-9._-]/g, "_")}.${safeExt}`;
}