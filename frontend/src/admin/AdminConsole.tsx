import { useEffect, useState } from "react";
import { admin } from "./apiClient";
import { Login } from "./Login";
import { Overview } from "./Overview";
import { Documents } from "./Documents";
import { SearchConsole } from "./SearchConsole";
import { JobsView, CollectionsView } from "./JobsCollections";
import { AuditLog, SystemHealth, PromptsView } from "./MiscPages";

const TABS = [
  { id: "overview", label: "Overview", node: <Overview /> },
  { id: "documents", label: "Documents", node: <Documents /> },
  { id: "search", label: "Search RAG", node: <SearchConsole /> },
  { id: "collections", label: "Collections", node: <CollectionsView /> },
  { id: "jobs", label: "Jobs", node: <JobsView /> },
  { id: "config", label: "Config / Prompts", node: <PromptsView /> },
  { id: "audit", label: "Audit", node: <AuditLog /> },
  { id: "health", label: "System Health", node: <SystemHealth /> },
];

export function AdminConsole() {
  const [authed, setAuthed] = useState<boolean | undefined>();
  const [username, setUsername] = useState<string | undefined>();
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    (async () => {
      try {
        const me = await admin.me();
        setAuthed(me.authenticated);
        setUsername(me.username);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  if (authed === undefined) {
    return <div className="panel loading-panel" role="status">Checking session…</div>;
  }
  if (!authed) {
    return <Login onSuccess={() => { setAuthed(true); setUsername("admin"); }} />;
  }

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="admin-console">
      <header className="app-header">
        <div className="app-title-block">
          <h1>RAG Administration Console</h1>
          <span className="hint">Signed in as {username} (admin)</span>
        </div>
        <div className="app-header-right">
          <button className="btn btn--ghost" onClick={() => void admin.logout().then(() => { setAuthed(false); })}>Sign out</button>
        </div>
      </header>
      <nav className="console-nav" aria-label="Console sections">
        {TABS.map((t) => (
          <button key={t.id} className={`console-tab ${t.id === tab ? "console-tab--active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="key">{current.node}</div>
    </div>
  );
}
