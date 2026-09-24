"use client";

export default function AdminHubTabs({ label, tabs, active, onChange }) {
  return <nav className="admin-hub-tabs" aria-label={label}>
    {tabs.map(item => <button type="button" key={item.id} className={active === item.id ? "active" : ""} aria-current={active === item.id ? 'page' : undefined} aria-pressed={active === item.id} onClick={() => onChange(item.id)}><strong>{item.label}</strong>{item.note && <small>{item.note}</small>}</button>)}
  </nav>;
}
