/** Admin console API client (session cookie + CSRF header). */

import { BenchmarkRun } from "../types";

export interface AdminSession {
  authenticated: boolean;
  username?: string;
  role?: string;
}

let csrfToken: string | undefined;

function csrfFromCookie(): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "rd_csrf") return rest.join("=");
  }
  return undefined;
}

async function call<T>(p: string, method = "GET", body?: unknown): Promise<T> {
  if (!csrfToken) csrfToken = csrfFromCookie();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(p, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* non-json error body */
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new AdminApiError(msg, res.status);
  }
  csrfToken = csrfFromCookie();
  return data as T;
}

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export const admin = {
  me: () => call<AdminSession>("/api/auth/me"),
  login: (username: string, password: string) =>
    call<{ username: string; role: string }>("/api/auth/login", "POST", { username, password }),
  logout: () => call<{ ok: boolean }>("/api/auth/logout", "POST", {}),

  overview: () => call<Record<string, unknown>>("/api/admin/overview"),
  health: () => call<Record<string, unknown>>("/api/admin/health"),

  documents: () => call<{ rag: { documents: unknown[] }; registry: unknown[] }>("/api/admin/documents"),
  document: (id: string) => call<Record<string, unknown>>(`/api/admin/documents/${encodeURIComponent(id)}`),
  chunks: (id: string) => call<{ documentId: string; totalChunks: number; chunks: Array<Record<string, unknown>> }>(
    `/api/admin/documents/${encodeURIComponent(id)}/chunks`
  ),
  uploadText: (payload: { text: string; title?: string; source?: string; documentId?: string }) =>
    call<{ documentId: string; chunksAdded: number }>("/api/admin/documents", "POST", payload),
  uploadFile: (file: File, extra: Record<string, string>) => {
    const fd = new FormData();
    fd.append("file", file);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    if (!csrfToken) csrfToken = csrfFromCookie();
    return fetch("/api/admin/upload", { method: "POST", body: fd, headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {} });
  },
  docAction: (id: string, action: "archive" | "restore" | "reprocess" | "reindex" | "delete", confirm?: string) =>
    call<Record<string, unknown>>(`/api/admin/documents/${encodeURIComponent(id)}/${action}`, "POST", confirm ? { confirm } : {}),

  search: (prompt: string, limit?: number) =>
    call<Record<string, unknown>>("/api/admin/search", "POST", { prompt, limit }),
  ragQuery: (messages: Array<{ role: string; content: string }>, model?: string) =>
    call<Record<string, unknown>>("/api/admin/rag-query", "POST", { messages, model }),

  collections: () => call<{ collections: string[] }>("/api/admin/collections"),
  jobs: () => call<{ jobs: unknown[] }>("/api/admin/jobs"),
  audit: (limit = 50, offset = 0, action?: string) =>
    call<{ total: number; items: unknown[] }>(
      `/api/admin/audit?limit=${limit}&offset=${offset}${action ? `&action=${encodeURIComponent(action)}` : ""}`
    ),
  config: () => call<Record<string, unknown>>("/api/admin/config"),
  testConnection: () => call<Record<string, unknown>>("/api/admin/config/test-connection", "POST", {}),
  prompts: () => call<Record<string, unknown>>("/api/admin/prompts"),
};

export type { BenchmarkRun };