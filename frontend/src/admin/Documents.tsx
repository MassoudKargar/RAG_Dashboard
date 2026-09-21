import { useEffect, useState } from "react";
import { admin, AdminApiError } from "./apiClient";

interface DocRow {
  documentId: string;
  chunks?: number;
  source?: string | number;
  filename?: string;
}
interface RegistryDoc {
  documentId: string;
  originalFilename?: string;
  checksum?: string;
  version?: number;
  status?: string;
  chunkCount?: number;
  createdAt?: string;
  lastError?: string;
}
interface UploadResult {
  status: string;
  message?: string;
}

export function Documents() {
  const [ragDocs, setRagDocs] = useState<DocRow[]>([]);
  const [registry, setRegistry] = useState<RegistryDoc[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [selected, setSelected] = useState<DocRow | undefined>();
  const [chunks, setChunks] = useState<{ totalChunks: number; chunks: Array<Record<string, unknown>> } | undefined>();
  const [inflight, setInflight] = useState<string | undefined>();
  const [msg, setMsg] = useState<UploadResult | undefined>();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [deleteDraft, setDeleteDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const load = async () => {
    try {
      const d = await admin.documents();
      setRagDocs((d.rag?.documents as unknown as DocRow[]) ?? []);
      setRegistry((d.registry as unknown as RegistryDoc[]) ?? []);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const viewChunks = async (doc: DocRow) => {
    setSelected(doc);
    setInflight(`chunks-${doc.documentId}`);
    try {
      setChunks(await admin.chunks(doc.documentId));
    } catch (e) { setMsg({ status: "error", message: (e as AdminApiError).message }); }
    finally { setInflight(undefined); }
  };

  const uploadText = async () => {
    if (!text.trim()) return;
    setInflight("upload-text");
    setMsg(undefined);
    try {
      const r = await admin.uploadText({ text, title: title || undefined, source: title || `manual-${Date.now()}` });
      setMsg({ status: "ok", message: `Uploaded ${r.documentId} — ${r.chunksAdded} chunks` });
      setText(""); setTitle("");
      await load();
    } catch (e) { setMsg({ status: "error", message: (e as Error).message }); }
    finally { setInflight(undefined); }
  };

  const uploadFile = async () => {
    if (!file) return;
    setInflight("upload-file");
    setMsg(undefined);
    try {
      const res = await admin.uploadFile(file, { title: title || file.name });
      const body = await res.json().catch(() => ({}));
      setMsg({ status: res.ok ? "ok" : "error", message: (body as { documentId?: string; chunksAdded?: number; error?: string }).documentId
        ? `Uploaded ${(body as { documentId: string }).documentId} — ${(body as { chunksAdded?: number }).chunksAdded} chunks`
        : ((body as { error?: string }).error ?? `HTTP ${res.status}`) });
      setFile(undefined); setTitle("");
      await load();
    } catch (e) { setMsg({ status: "error", message: (e as Error).message }); }
    finally { setInflight(undefined); }
  };

  const action = async (docId: string, act: string) => {
    setInflight(`${act}-${docId}`);
    setMsg(undefined);
    try {
      const r = await admin.docAction(docId, act as never, act === "delete" ? deleteDraft : undefined);
      setMsg({ status: "ok", message: `${act} — ${JSON.stringify(r)}` });
      setDeleteDraft("");
      await load();
    } catch (e) { setMsg({ status: "error", message: (e as Error).message }); }
    finally { setInflight(undefined); }
  };

  const filteredRag = searchQ ? ragDocs.filter((d) => (d.documentId ?? "").toLowerCase().includes(searchQ.toLowerCase())) : ragDocs;

  return (
    <div>
      <section className="panel">
        <h2>Upload</h2>
        <div className="selectors">
          <label className="field">
            <span>Title / filename</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title (or filename)" />
          </label>
          <label className="field">
            <span>File (TXT/MD/CSV/JSON/HTML)</span>
            <input type="file" accept=".txt,.md,.csv,.json,.html,.htm,text/*,application/json" onChange={(e) => setFile(e.target.files?.[0])} />
          </label>
        </div>
        <div className="selectors">
          <button className="btn" onClick={uploadFile} disabled={!file || inflight !== undefined}>Upload file</button>
          <span className="hint">PDF/DOCX are rejected by the production pipeline (no parser library).</span>
        </div>
        <label className="field">
          <span>…or paste text (manual entry)</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
        </label>
        <div className="selectors">
          <button className="btn" onClick={uploadText} disabled={!text.trim() || inflight !== undefined}>Ingest pasted text</button>
        </div>
        {msg && (
          <div className={`banner ${msg.status === "ok" ? "banner--warn" : "banner--error"}`} role="status">
            {msg.status === "ok" ? "✅ " : "⚠ "}{msg.message}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Document management</h2>
        <label className="field"><span>Filter by document id</span><input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} /></label>
        {error && <div className="banner banner--error">⚠ {error}</div>}
        <table className="run-table">
          <thead>
            <tr><th>Document ID</th><th>Chunks</th><th>Source</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filteredRag.map((d) => {
              const reg = registry.find((r) => r.documentId === d.documentId);
              return (
                <tr key={d.documentId}>
                  <td><button className="btn btn--sm btn--ghost" onClick={() => viewChunks(d)}>{d.documentId}</button></td>
                  <td>{reg?.chunkCount ?? d.chunks ?? reg?.chunkCount ?? "—"}</td>
                  <td>{reg?.status ?? "indexed"} · {d.source ?? reg?.originalFilename ?? "—"}</td>
                  <td className="actions-col">
                    <button className="btn btn--sm" disabled={inflight !== undefined} onClick={() => action(d.documentId, "archive")}>Archive</button>
                    <button className="btn btn--sm btn--ghost" disabled={inflight !== undefined} onClick={() => action(d.documentId, "restore")}>Restore</button>
                    <button className="btn btn--sm btn--ghost" disabled={inflight !== undefined} onClick={() => action(d.documentId, "reindex")}>Reindex</button>
                    <button className="btn btn--sm btn--ghost" disabled={inflight !== undefined} onClick={() => action(d.documentId, "reprocess")}>Reprocess</button>
                  </td>
                </tr>
              );
            })}
            {filteredRag.length === 0 && <tr><td colSpan={4} className="empty-cell">No documents match.</td></tr>}
          </tbody>
        </table>
      </section>

      {selected && (
        <section className="panel" aria-label={`Chunk inspector for ${selected.documentId}`}>
          <h2>Chunk inspector — {selected.documentId}</h2>
          <p className="hint">{chunks?.totalChunks ?? 0} chunks · status: {registry.find((r) => r.documentId === selected.documentId)?.status ?? "indexed"}</p>
          {chunks && (
            <div className="run-table-wrap">
              <table className="run-table">
                <thead><tr><th>Chunk ID</th><th>Idx</th><th>Section</th><th>Chars</th><th>Preview</th></tr></thead>
                <tbody>
                  {chunks.chunks.slice(0, 50).map((c, i) => (
                    <tr key={i}>
                      <td className="mono">{c.chunk_id as string}</td>
                      <td>{c.chunk_index as string}</td>
                      <td>{c.section as string ?? "—"}</td>
                      <td>{c.char_count as number}</td>
                      <td>{(c.text as string)?.slice(0, 140)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="meta-head" />
          <h3>Permanent delete (typed confirmation)</h3>
          <p className="hint">This removes the document's vectors from the production vector store and marks it deleted in the registry. Requires typing <code>DELETE {selected.documentId}</code>.</p>
          <div className="selectors">
            <input value={deleteDraft} onChange={(e) => setDeleteDraft(e.target.value)} placeholder={`DELETE ${selected.documentId}`} aria-label="Delete confirmation" />
            <button className="btn" disabled={deleteDraft !== `DELETE ${selected.documentId}` || inflight !== undefined} onClick={() => action(selected.documentId, "delete")}>Delete permanently</button>
          </div>
        </section>
      )}
    </div>
  );
}
