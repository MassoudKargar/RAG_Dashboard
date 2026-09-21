import { useState } from "react";
import { admin } from "./apiClient";

export function SearchConsole() {
  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState("5");
  const [results, setResults] = useState<Record<string, any> | undefined>();
  const [chatMsg, setChatMsg] = useState("");
  const [chatOut, setChatOut] = useState<{ response?: any; latencyMs?: number } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const doSearch = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setError(undefined);
    try { setResults(await admin.search(prompt, Number(limit) || 5)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const doChat = async () => {
    if (!chatMsg.trim()) return;
    setBusy(true); setError(undefined);
    try {
      const out = await admin.ragQuery([{ role: "user", content: chatMsg }]);
      setChatOut(out as { response?: any; latencyMs?: number });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <section className="panel">
        <h2>Search playground</h2>
        <p className="hint">Runs a real vector retrieval against the production collection. Scores are distances (lower = more similar).</p>
        <div className="selectors">
          <label className="field" style={{ flex: 3 }}>
            <span>Query</span>
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} />
          </label>
          <label className="field">
            <span>Top-K</span>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 80 }} />
          </label>
          <button className="btn" onClick={doSearch} disabled={busy || !prompt.trim()}>Search</button>
        </div>
        {error && <div className="banner banner--error">⚠ {error}</div>}
        {results && (
          <>
            <p className="hint">Latency: {results.latencyMs} ms · stage: {JSON.stringify(results.stage ?? {})}</p>
            <table className="run-table">
              <thead><tr><th>#</th><th>Score</th><th>Metadata</th><th>Chunk</th></tr></thead>
              <tbody>
                {results.results.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.id === undefined ? i + 1 : r.id}</td>
                    <td>{r.score !== undefined ? (r.score as number).toFixed(4) : "—"}</td>
                    <td>{r.metadata ? JSON.stringify(r.metadata).slice(0, 120) : "—"}</td>
                    <td>{(r.text as string)?.slice(0, 200)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h2>RAG query (chat with context)</h2>
        <div className="selectors">
          <label className="field" style={{ flex: 3 }}>
            <span>Message</span>
            <input value={chatMsg} onChange={(e) => setChatMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doChat()} />
          </label>
          <button className="btn" onClick={doChat} disabled={busy || !chatMsg.trim()}>Ask</button>
        </div>
        {chatOut && (
          <div className="hint">
            <p>Latency: {chatOut.latencyMs} ms · model: {chatOut.response?.model}</p>
            <pre className="mono">{JSON.stringify(chatOut.response ?? {}, null, 2).slice(0, 3000)}</pre>
          </div>
        )}
      </section>
    </div>
  );
}
