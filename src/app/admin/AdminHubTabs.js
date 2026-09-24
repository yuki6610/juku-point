"use client";

export default function AdminHubTabs({ label, tabs, active, onChange }) {
  return <nav className="admin-hub-tabs" aria-label={label}>
    {tabs.map(item => <button type="button" key={item.id} className={active === item.id ? "active" : ""} aria-pressed={active === item.id} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </nav>;
}
