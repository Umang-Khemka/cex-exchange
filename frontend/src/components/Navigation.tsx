import type { Page } from "../types/navigation";

export function Mark() {
  return <span className="mark" aria-label="Coinlattice logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 10 16 5l9 5v12l-9 5-9-5Z"/><path d="m7 10 9 5 9-5M16 15v12M7 22l9-5 9 5"/><circle cx="7" cy="10" r="1.7"/><circle cx="16" cy="5" r="1.7"/><circle cx="25" cy="10" r="1.7"/><circle cx="7" cy="22" r="1.7"/><circle cx="16" cy="27" r="1.7"/><circle cx="25" cy="22" r="1.7"/><circle cx="16" cy="15" r="1.7"/></svg></span>;
}

export function Sidebar({ page, onPage, collapsed, onToggle }: { page: Page; onPage: (page: Page) => void; collapsed: boolean; onToggle: () => void }) {
  const navigation: [Page, string, string][] = [["trade", "⌁", "Trade"], ["markets", "◫", "Markets"], ["wallet", "▣", "Wallet"], ["history", "◷", "History"]];
  return <aside className={`rail ${collapsed ? "collapsed" : ""}`}>
    <div className="brand"><Mark /><span>COIN<br />LATTICE</span><button className="collapse-button" onClick={onToggle} aria-label="Toggle sidebar">‹</button></div>
    <nav aria-label="Primary navigation">{navigation.map(([key, icon, label]) => <button key={key} onClick={() => onPage(key)} className={`nav-item ${page === key ? "active" : ""}`}><span>{icon}</span><b>{label}</b></button>)}</nav>
    <div className="rail-bottom"><button className="help-button"><span>?</span><b>Help centre</b></button><button className="user-chip" onClick={() => onPage("auth")}><b>U</b><span>umangk<small>Verified</small></span><i>⌄</i></button></div>
  </aside>;
}

export function Topbar({ onAuth, onToggle }: { onAuth: () => void; onToggle: () => void }) {
  return <header className="topbar"><div className="mobile-brand"><button onClick={onToggle}>☰</button><Mark /> COINLATTICE</div><div className="status"><i /> Systems nominal <span>•</span> UTC 05:12:08</div><div className="top-actions"><button className="icon-button">♢</button><button className="deposit-button" onClick={onAuth}>+ Deposit</button></div></header>;
}
