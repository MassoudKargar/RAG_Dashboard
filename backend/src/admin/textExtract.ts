/**
 * Safe file -> text extraction for the formats the production RAG pipeline is
 * compatible with (TXT, Markdown, CSV, JSON, HTML). PDF/DOCX are NOT part of
 * the existing production stack (no parser library), so they are rejected
 * safely with a clear reason — never silently parsed as garbage.
 */

const MAX_EXTRACTED = 2 * 1024 * 1024; // guard: extracted text cap (config also applies)

export interface ExtractionResult {
  ok: boolean;
  text?: string;
  reason?: string;
}

function blobToStr(buf: Uint8Array): string {
  // Strip UTF-8 BOM if present
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  try {
    return new TextDecoder("utf-8").decode(buf.slice(start));
  } catch {
    return Buffer.from(buf.slice(start)).toString("utf8");
  }
}

export function extractText(mime: string, ext: string, bytes: Uint8Array, maxBytes: number): ExtractionResult {
  if (bytes.length > maxBytes) {
    return { ok: false, reason: `File exceeds the configured size limit (${maxBytes} bytes)` };
  }
  const m = mime.toLowerCase();
  const isTextual =
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/csv" ||
    m === "application/x-json" ||
    ext === "txt" || ext === "md" || ext === "csv" || ext === "json" || ext === "html" || ext === "htm";
  if (!isTextual) {
    if (m === "application/pdf" || ext === "pdf") {
      return { ok: false, reason: "PDF parsing is not available in the production pipeline (no parser library)" };
    }
    if (m.includes("word") || ext === "docx" || ext === "doc") {
      return { ok: false, reason: "DOCX/DOC parsing is not available in the production pipeline (no parser library)" };
    }
    if (m.includes("zip") || m.includes("compressed") || m.includes("archive")) {
      return { ok: false, reason: "Archive formats are not accepted" };
    }
    return { ok: false, reason: `Unsupported content type: ${mime}` };
  }

  let text = blobToStr(bytes);
  if (text.length > MAX_EXTRACTED) {
    return { ok: false, reason: "Extracted text exceeds the safety cap" };
  }
  // HTML -> minimal readable text (no JS, no tags), preserving newlines.
  if (ext === "html" || ext === "htm" || m === "text/html") {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim();
  }
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return { ok: false, reason: "File contains no extractable text" };
  return { ok: true, text };
}

/** MIME normalization from magic bytes (content inspection, not extension trust). */
export function sniffMime(bytes: Uint8Array): string {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x05 && bytes[3] === 0x06) {
    return "application/zip";
  }
  if (bytes.length >= 2 && ((bytes[0] === 0x1f && bytes[1] === 0x8b))) return "application/gzip";
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return "application/x-executable";
  }
  return "text/plain";
}

export function allowedExtension(bytes: Uint8Array, mime: string): boolean {
  const m = sniffMime(bytes);
  if (m === "application/pdf") return false;
  if (m.includes("word") || m === "application/zip" || m === "application/gzip") return false;
  if (m === "application/x-executable") return false;
  if ([ "text/plain", "application/json", "text/html", "application/csv" ].includes(m)) return true;
  return mime.startsWith("text/");
}