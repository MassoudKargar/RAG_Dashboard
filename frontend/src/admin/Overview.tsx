import { useEffect, useState } from "react";
import { admin } from "./apiClient";

interface Card {
  label: string;
  value: string | number | undefined;
  kind?: "ok" | "warn" | "err" | "info";
}

function Stat({ c }: { c: Card }) {
  return (
    <div className="metric-card">
      <div className="metric-card__head">
        <h3 className="metric-card__title">{c.label}</h3>
      </div>
      <div className="metric-value__num" title={c.value !== undefined ? String(c.value) : "Not available"}>
        {c.value ?? "N/A"}
      </div>
    </div>
  );
}

export function Overview() {
  const [data, setData] = useState<Record<string, any> | undefined>();
  const [health, setHealth] = useState<Record<string, any> | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, h] = await Promise.all([admin.overview(), admin.health()]);
        if (!cancelled) {
          setData(o);
          setHealth(h);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="banner banner--error">⚠ {error}</div>;
  if (!data) return <div className="panel loading-panel" role="status">Loading overview…</div>;

  const rag: Record<string, any> = data.rag ?? {};
  const reg: Record<string, any> = data.registry ?? {};
  const jobs: Record<string, any> = data.jobs ?? {};
  const stats: Record<string, any> = rag.stats ?? {};

  const cards: Card[] = [
    { label: "RAG API", value: health?.services?.rag_api, kind: health?.services?.rag_api === "ok" ? "ok" : "err" },
    { label: "Total documents (registry)", value: reg.documents },
    { label: "Total chunks (registry)", value: reg.totalChunks },
    { label: "Production docs (vector store)", value: stats.total_documents },
    { label: "Production chunks (vector store)", value: stats.total_chunks },
    { label: "Active collection", value: stats.collection, kind: "info" },
    { label: "Embedding provider", value: stats.embedding_provider, kind: "info" },
    { label: "Failed documents", value: reg.byStatus?.failed ?? 0, kind: (reg.byStatus?.failed ?? 0) > 0 ? "warn" : "ok" },
    { label: "Jobs completed", value: jobs.completed ?? 0 },
    { label: "Jobs failed", value: jobs.failed ?? 0, kind: (jobs.failed ?? 0) > 0 ? "warn" : "ok" },
    { label: "Jobs queued", value: jobs.queued ?? 0 },
    { label: "Audit events", value: data.auditCount },
  ];

  return (
    <section className="panel" aria-label="Overview">
      <h2>Overview</h2>
      <div className="grid metric-grid">
        {cards.map((c, i) => <Stat key={i} c={c} />)}
      </div>
      {rag.error && <div className="banner banner--warn">⚠ RAG service: {rag.error}</div>}
      {jobs.latest?.length > 0 && (
        <>
          <h3>Recent jobs</h3>
          <table className="run-table">
            <thead>
              <tr><th>Job</th><th>Type</th><th>Document</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {jobs.latest.map((j: any) => (
                <tr key={j.id}>
                  <td className="mono">{j.id?.slice(0, 10)}</td>
                  <td>{j.type}</td>
                  <td>{j.documentId}</td>
                  <td>{j.status}</td>
                  <td>{new Date(j.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
