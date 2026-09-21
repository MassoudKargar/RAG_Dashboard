import { Config } from "../config.js";

export interface UpstreamResult {
  ok: boolean;
  status?: number;
  payload?: unknown;
  error?: { kind: string; message: string };
  durationMs: number;
}

const MAX_PENDING_BYTES = 1 * 1024 * 1024; // safety cap for the response accumulator

/**
 * Fetch the configured upstream benchmark API. Credentials are attached here on
 * the server only and are never returned to the browser.
 */
export async function fetchUpstream(cfg: Config): Promise<UpstreamResult> {
  if (!cfg.upstreamUrl) {
    return {
      ok: false,
      error: { kind: "not_configured", message: "Upstream API is not configured" },
      durationMs: 0,
    };
  }

  const url = `${cfg.upstreamUrl}${cfg.upstreamPath}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (cfg.authMode === "bearer" && cfg.authToken) {
    headers["Authorization"] = `Bearer ${cfg.authToken}`;
  } else if (cfg.authMode === "header" && cfg.authHeaderName) {
    headers[cfg.authHeaderName] = cfg.authHeaderValue ?? "";
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: { kind: "http", message: `Upstream responded ${res.status}` },
        durationMs: Date.now() - started,
      };
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > cfg.maxResponseBytes) {
      return {
        ok: false,
        status: res.status,
        error: {
          kind: "too_large",
          message: "Upstream response exceeds configured size limit",
        },
        durationMs: Date.now() - started,
      };
    }

    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > cfg.maxResponseBytes || received > MAX_PENDING_BYTES) {
          await reader.cancel();
          return {
            ok: false,
            status: res.status,
            error: { kind: "too_large", message: "Upstream response exceeds size limit" },
            durationMs: Date.now() - started,
          };
        }
        chunks.push(value);
      }
    }

    const text = Buffer.concat(chunks).toString("utf8");
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        ok: false,
        status: res.status,
        error: { kind: "invalid_json", message: "Upstream returned invalid JSON" },
        durationMs: Date.now() - started,
      };
    }
    return { ok: true, status: res.status, payload, durationMs: Date.now() - started };
  } catch (e) {
    const err = e as Error & { name?: string };
    const kind = err?.name === "AbortError" ? "timeout" : "unreachable";
    return {
      ok: false,
      error: { kind, message: kind === "timeout" ? "Upstream timed out" : "Upstream unreachable" },
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
