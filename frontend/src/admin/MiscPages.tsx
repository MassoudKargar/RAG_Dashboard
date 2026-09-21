import { useEffect, useState } from "react";
import { admin } from "./apiClient";

export function AuditLog() {
  const [items, setItems] = useState<Array<Record<string, any>>>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [limit] = useState("50");

  const load = async () => {
    try {
      const page = await admin.audit(Number(limit) || 50, 0);
      setItems(page.items as Array<Record<string, any>>);
      setTotal(page.total);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <section className="panel">
      <h2>Audit log</h2>
      <p className="hint">{total} events · append-only, not editable through the console.</p>
      <div className="selectors">
        <button className="btn btn--sm" onClick={() => void load()}>Refresh</button>
      </div>
      {error && <div className="banner banner--error">⚠ {error}</div>}
      <div className="run-table-wrap">
        <table className="run-table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>ID</th><th>Result</th><th>IP</th></tr></thead>
          <tbody>
            {items.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.ts).toLocaleString()}</td>
                <td>{e.userId}</td>
                <td>{e.action}</td>
                <td>{e.resourceType ?? "—"}</td>
                <td>{e.resourceId ?? "—"}</td>
                <td>{e.result}</td>
                <td>{e.ip ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="empty-cell">No audit events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SystemHealth() {
  const [h, setH] = useState<Record<string, any> | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    (async () => {
      try { setH(await admin.health()); }
      catch (e) { setError((e as Error).message); }
    })();
  }, []);
  return (
    <section className="panel">
      <h2>System health</h2>
      {error && <div className="banner banner--error">⚠ {error}</div>}
      {h && (
        <table className="run-table">
          <thead><tr><th>Service</th><th>Status</th></tr></thead>
          <tbody>
            {Object.entries(h.services ?? {}).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{String(v)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function PromptsView() {
  const [prompts, setPrompts] = useState<unknown[]>([]);
  const [config, setConfig] = useState<Record<string, any> | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    (async () => {
      try { const [p, c] = await Promise.all([admin.prompts(), admin.config()]); setPrompts((p as any).prompts ?? []); setConfig(c as any); }
      catch (e) { setError((e as Error).message); }
    })();
  }, []);
  return (
    <section className="panel">
      <h2>Prompts & configuration</h2>
      {error && <div className="banner banner--error">⚠ {error}</div>}
      {config?.settings && (
        <>
          <h3>Configuration (values masked)</h3>
          <p className="hint">{config.note}</p>
          <table className="run-table">
            <thead><tr><th>Setting</th><th>Status</th><th>Value</th></tr></thead>
            <tbody>
              {(config.settings as Array<{ name: string; status: string; masked: boolean }>).map((s) => (
                <tr key={s.name}><td className="mono">{s.name}</td><td>{s.status}</td><td>{s.masked ? "••••" : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h3>Prompt versions</h3>
      {prompts.length === 0 && <p className="hint">No prompt versions saved.</p>}
      <ul>{prompts.map((p, i) => <li key={i} className="mono">{JSON.stringify((p as any).name ?? p)}</li>)}</ul>
    </section>
  );
}
