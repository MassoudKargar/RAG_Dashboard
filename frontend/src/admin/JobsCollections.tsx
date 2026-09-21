import { useEffect, useState } from "react";
import { admin } from "./apiClient";

export function JobsView() {
  const [jobs, setJobs] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState<string | undefined>();

  const load = async () => {
    try { setJobs((await admin.jobs()).jobs as Array<Record<string, any>>); }
    catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <section className="panel">
      <h2>Ingestion jobs</h2>
      {error && <div className="banner banner--error">⚠ {error}</div>}
      <table className="run-table">
        <thead><tr><th>Job</th><th>Type</th><th>Document</th><th>Status</th><th>Progress</th><th>Created</th><th>Error</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="mono">{j.id?.slice(0, 10)}</td>
              <td>{j.type}</td>
              <td>{j.documentId}</td>
              <td>{j.status}</td>
              <td>{j.progress ?? 0}%</td>
              <td>{new Date(j.createdAt).toLocaleString()}</td>
              <td className="hint">{j.errorSummary ?? "—"}</td>
            </tr>
          ))}
          {jobs.length === 0 && <tr><td colSpan={7} className="empty-cell">No jobs recorded.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export function CollectionsView() {
  const [cols, setCols] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    (async () => {
      try { setCols((await admin.collections()).collections ?? []); }
      catch (e) { setError((e as Error).message); }
    })();
  }, []);
  return (
    <section className="panel">
      <h2>Collections</h2>
      {error && <div className="banner banner--error">⚠ {error}</div>}
      <p className="hint">{cols.length} collections in the vector store.</p>
      <ul>{cols.map((c) => <li key={c} className="mono">{c}</li>)}</ul>
    </section>
  );
}
