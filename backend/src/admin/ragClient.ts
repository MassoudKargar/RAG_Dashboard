import { loadConfig } from "../config.js";

/**
 * Server-side RAG API client. The API key lives ONLY here (from env) and is
 * never sent to the browser. All calls target 127.0.0.1:8000 (localhost).
 */

export class RagClientError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "RagClientError";
    this.status = status;
  }
}

interface RagClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class RagClient {
  private base: string;
  private key: string;
  private timeoutMs: number;

  constructor(opts: RagClientOptions = {}) {
    const cfg = loadConfig();
    this.base = (opts.baseUrl ?? cfg.ragApiUrl ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
    this.key = opts.apiKey ?? cfg.ragApiKey ?? "";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    // Fail at use, not at boot: demo mode and tests must start without a key.
  }

  private async call<T>(method: string, p: string, body?: unknown): Promise<T> {
    if (!this.key) throw new RagClientError("RAG API key is not configured server-side");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${p}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.key,
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 500) };
      }
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new RagClientError(detail ?? `RAG API returned ${res.status}`, res.status);
      }
      return data as T;
    } catch (e) {
      if (e instanceof RagClientError) throw e;
      const err = e as Error;
      throw new RagClientError(err.name === "AbortError" ? "RAG API timed out" : "RAG API unreachable");
    } finally {
      clearTimeout(timer);
    }
  }

  /** Production ingestion: parse+chunk+embed+index via the existing pipeline. */
  async ingest(text: string, source: string | undefined, metadata: Record<string, unknown>): Promise<{
    document_id: string;
    chunks_added: number;
    chunk_ids: string[];
    message: string;
  }> {
    return this.call("POST", "/v1/vector_db/documents", { text, source, metadata });
  }

  async searchDocuments(prompt: string, limit?: number): Promise<Array<Record<string, unknown>>> {
    return this.call("POST", `/v1/vector_db/search_documents${limit ? `?limit=${limit}` : ""}`, { prompt });
  }

  async chat(messages: Array<{ role: string; content: string }>, model?: string): Promise<Record<string, unknown>> {
    return this.call("POST", "/v1/chat/completions", { messages, model });
  }

  async health(): Promise<Record<string, unknown>> {
    return this.call("GET", "/v1/health");
  }

  // ---- Internal admin API (added to the RAG service, same codebase) ----

  async adminCollections(): Promise<{ collections: string[] }> {
    return this.call("GET", "/v1/vector_db/admin/collections");
  }

  async adminStats(): Promise<Record<string, unknown>> {
    return this.call("GET", "/v1/vector_db/admin/stats");
  }

  async adminDocuments(prefix?: string, limit = 500, offset = 0): Promise<Record<string, unknown>> {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (prefix) q.set("prefix", prefix);
    return this.call("GET", `/v1/vector_db/admin/documents?${q}`);
  }

  async adminChunks(documentId: string, limit = 2000): Promise<Record<string, unknown>> {
    return this.call("GET", `/v1/vector_db/admin/documents/${encodeURIComponent(documentId)}/chunks?limit=${limit}`);
  }

  async adminDeleteDocument(documentId: string): Promise<Record<string, unknown>> {
    return this.call("DELETE", `/v1/vector_db/admin/documents/${encodeURIComponent(documentId)}`);
  }
}