"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import {
  NAV_DEF, SECTION_META, ORG_FIELDS, BRANDS_DATA, TEAMS_DATA, USERS_DATA,
  PERM_MODULES, PERM_ROLES, BUDGET_THRESHOLDS, APPROVAL_RULES,
  WF_MODULE_LABELS, STATUS_SETS, WfModule, NOTIF_CHANNELS, NOTIF_TRIGGERS,
  INTEGRATIONS, TEMPLATES, AUDIT_LOG, TYPE_COLOR,
} from "@/lib/data/settings";

const initials = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();

function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return <span className="text-[11px] font-bold px-[9px] py-[3px] rounded-pill whitespace-nowrap inline-block" style={{ color: fg, background: bg }}>{text}</span>;
}
function typePill(module: string) {
  const c = TYPE_COLOR[module] ?? "#6b6258";
  return <Pill text={module} fg={c} bg={`${c}18`} />;
}
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-[38px] h-[22px] rounded-pill relative transition flex-shrink-0" style={{ background: on ? "#4E7A4E" : "#D0C8BC" }}>
      <span className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all" style={{ left: on ? "18px" : "2px" }} />
    </button>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState("org");
  const [wfModule, setWfModule] = useState<WfModule>("campaign");
  const [channels, setChannels] = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_CHANNELS.map((c) => [c.key, c.def])));
  const [triggers, setTriggers] = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_TRIGGERS.map((t) => [t.key, t.def])));
  const meta = SECTION_META[section];

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar */}
      <aside className="w-[228px] flex-shrink-0 sticky top-5 hidden md:block">
        <div className="text-[22px] font-extrabold tracking-[-0.02em] mb-1">Settings</div>
        <div className="text-[12px] text-faint mb-5">Control center for the whole OS.</div>
        {NAV_DEF.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-faint px-3 mb-1">{g.group}</div>
            {g.items.map((it) => {
              const active = it.id === section;
              return (
                <button key={it.id} onClick={() => setSection(it.id)}
                  className={clsx("w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] mb-[2px] text-left", active ? "font-bold text-ink" : "font-medium text-muted hover:bg-ivory")}
                  style={active ? { background: "#F5EFE4" } : undefined}>
                  <span>{it.icon}</span>{it.label}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        <div className="mb-5">
          <div className="text-[20px] font-extrabold tracking-[-0.01em]">{meta.title}</div>
          <div className="text-[13px] text-faint mt-1">{meta.desc}</div>
        </div>

        {/* Mobile section picker */}
        <div className="md:hidden mb-4">
          <select value={section} onChange={(e) => setSection(e.target.value)} className="w-full text-[14px] px-3 py-[10px] rounded-[10px] border border-line2 bg-white">
            {NAV_DEF.flatMap((g) => g.items).map((it) => <option key={it.id} value={it.id}>{it.icon} {it.label}</option>)}
          </select>
        </div>

        {section === "org" && (
          <div className="bg-surface border border-line rounded-cardLg p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl">
            {ORG_FIELDS.map((f) => (
              <div key={f.label}><div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{f.label}</div><div className="text-[14px] font-semibold text-ink">{f.value}</div></div>
            ))}
          </div>
        )}

        {section === "brands" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {BRANDS_DATA.map((b) => (
              <div key={b.key} className="bg-surface border border-line rounded-cardLg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-9 h-9 rounded-[10px]" style={{ background: b.color }} />
                  <div className="flex-1"><div className="text-[14.5px] font-bold">{b.name}</div><div className="text-[11.5px] text-faint">Lead · {b.lead}</div></div>
                  <span className="text-[12px] text-accent font-bold cursor-pointer">Edit</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[["Branches", b.branches], ["Campaigns", b.campaigns], ["Budget", b.budget]].map(([l, v]) => (
                    <div key={l as string} className="bg-ivory border border-line3 rounded-card p-2 text-center"><div className="text-[14px] font-extrabold">{v}</div><div className="text-[9.5px] text-faint font-bold uppercase">{l as string}</div></div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-[6px]">{b.branchList.map((br) => <span key={br} className="text-[11px] text-muted bg-ivory border border-line3 rounded-pill px-[9px] py-[3px]">{br}</span>)}</div>
              </div>
            ))}
          </div>
        )}

        {section === "teams" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TEAMS_DATA.map((t) => (
              <div key={t.name} className="bg-surface border border-line rounded-cardLg p-5">
                <div className="flex items-center gap-2 mb-2"><span className="text-[18px]">{t.icon}</span><div className="text-[14.5px] font-bold">{t.name}</div><span className="ml-auto text-[11.5px] text-faint">Lead · {t.lead}</span></div>
                <div className="text-[12px] text-muted mb-3">{t.scope}</div>
                <div className="flex flex-wrap gap-[6px]">{t.members.map((m) => <span key={m} className="text-[11px] font-semibold text-muted bg-ivory border border-line3 rounded-pill px-[9px] py-[3px]">{m}</span>)}</div>
              </div>
            ))}
          </div>
        )}

        {section === "users" && (
          <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-line4"><div className="text-[13px] font-bold">{USERS_DATA.length} members</div><button className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[7px]">+ Invite</button></div>
            {USERS_DATA.map((u) => (
              <div key={u.email} className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1fr_1.2fr_0.8fr] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0">
                <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: u.color }}>{initials(u.name)}</span><div><div className="text-[13.5px] font-bold">{u.name}</div><div className="text-[11px] text-faint">{u.email}</div></div></div>
                <div className="text-[12.5px] text-muted">{u.role}</div>
                <div><Pill text={u.access} fg={u.access === "Admin" ? "#B8945A" : u.access === "Editor" ? "#3E5C9A" : "#9A9387"} bg={u.access === "Admin" ? "#FBF6ED" : u.access === "Editor" ? "#EEF1F8" : "#F2F0EB"} /></div>
                <div className="text-[12px] text-muted">{u.brandAccess}</div>
                <div><Pill text={u.status} fg="#4E7A4E" bg="#EEF4EE" /></div>
              </div>
            ))}
          </div>
        )}

        {section === "perms" && (
          <div className="bg-surface border border-line rounded-cardLg overflow-x-auto">
            <table className="w-full text-left" style={{ borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr className="border-b border-line4"><th className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold px-4 py-3">Role</th>{PERM_MODULES.map((m) => <th key={m} className="text-[10px] uppercase tracking-[0.04em] text-faint font-bold px-2 py-3 text-center">{m}</th>)}</tr>
              </thead>
              <tbody>
                {PERM_ROLES.map((r) => (
                  <tr key={r.role} className="border-b border-line4 last:border-0">
                    <td className="px-4 py-3"><div className="text-[13px] font-bold">{r.role}</div><div className="text-[11px] text-faint">{r.desc}</div></td>
                    {r.perms.map((p, i) => <td key={i} className="px-2 py-3 text-center"><span className="text-[10.5px] font-bold px-2 py-[2px] rounded-[6px] whitespace-nowrap" style={{ background: p.b, color: p.c }}>{p.l}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "approval" && (
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-[13px] font-bold mb-3">Budget Threshold Approval</div>
              <div className="flex flex-col gap-2">
                {BUDGET_THRESHOLDS.map((b) => (
                  <div key={b.range} className="bg-surface border border-line rounded-card p-4 flex items-center gap-4 flex-wrap">
                    <div className="min-w-[150px]"><div className="text-[13.5px] font-bold">{b.range}</div><div className="text-[11.5px] text-faint">{b.approver}</div></div>
                    <div className="flex items-center gap-1 flex-wrap">{b.chain.map((c, i) => <span key={i} className="flex items-center gap-1"><span className="text-[11px] font-bold px-[9px] py-[3px] rounded-pill" style={{ background: "#EEF1F8", color: "#3E5C9A" }}>{c}</span>{i < b.chain.length - 1 && <span className="text-faint text-[11px]">→</span>}</span>)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-3">Module Approval Rules</div>
              <div className="flex flex-col gap-2">
                {APPROVAL_RULES.map((r) => (
                  <div key={r.module} className="bg-surface border border-line rounded-card p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap"><span className="text-[16px]">{r.icon}</span><span className="text-[13.5px] font-bold">{r.module}</span>
                      <div className="flex items-center gap-1 flex-wrap ml-2">{r.chain.map((c, i) => <span key={i} className="flex items-center gap-1"><span className="text-[11px] font-semibold px-[8px] py-[2px] rounded-pill" style={{ background: "#EEF1F8", color: "#3E5C9A" }}>{c}</span>{i < r.chain.length - 1 && <span className="text-faint text-[10px]">→</span>}</span>)}</div>
                    </div>
                    <div className="text-[11.5px] text-faint">SLA {r.sla}d · escalate {r.escalate}d · remind every {r.remind}d · backup {r.backup}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === "workflow" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {(Object.keys(WF_MODULE_LABELS) as WfModule[]).map((m) => {
                const active = m === wfModule;
                return <button key={m} onClick={() => setWfModule(m)} className="text-[12px] px-[14px] py-[6px] rounded-pill" style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>{WF_MODULE_LABELS[m]}</button>;
              })}
            </div>
            <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
              {STATUS_SETS[wfModule].map((s) => {
                const tone = s.type === "Done" ? ["#4E7A4E", "#EEF4EE"] : s.type === "Waiting" ? ["#C68A1E", "#FBF8EE"] : s.type === "Cancelled" ? ["#B33A2E", "#FFF5F4"] : ["#3E5C9A", "#EEF1F8"];
                return (
                  <div key={s.order} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
                    <span className="text-[11px] font-bold text-faint w-5">{s.order}</span>
                    <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                    <span className="text-[13.5px] font-semibold flex-1">{s.name}</span>
                    <Pill text={s.type} fg={tone[0]} bg={tone[1]} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === "notifs" && (
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-[13px] font-bold mb-3">Channels</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {NOTIF_CHANNELS.map((c) => (
                  <div key={c.key} className="bg-surface border border-line rounded-card p-4 flex items-center gap-3">
                    <span className="text-[18px]">{c.icon}</span>
                    <div className="flex-1"><div className="text-[13.5px] font-bold">{c.label}</div><div className="text-[11.5px] text-faint">{c.desc}</div></div>
                    <Toggle on={channels[c.key]} onClick={() => setChannels((s) => ({ ...s, [c.key]: !s[c.key] }))} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-3">Triggers</div>
              <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
                {NOTIF_TRIGGERS.map((t) => (
                  <div key={t.key} className="flex items-center gap-4 px-5 py-3 border-b border-line4 last:border-0">
                    <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{t.trigger}</div><div className="text-[11.5px] text-faint">{t.desc}</div></div>
                    <div className="hidden sm:flex gap-1">{t.channels.map((ch) => <span key={ch} className="text-[10.5px] font-bold text-muted bg-ivory border border-line3 rounded-pill px-2 py-[2px]">{ch}</span>)}</div>
                    <span className="hidden md:block text-[11px] text-faint w-20 text-right">{t.timing}</span>
                    <Toggle on={triggers[t.key]} onClick={() => setTriggers((s) => ({ ...s, [t.key]: !s[t.key] }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === "integrations" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INTEGRATIONS.map((it) => (
              <div key={it.name} className="bg-surface border border-line rounded-cardLg p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px]" style={{ background: it.iconBg }}>{it.icon}</span>
                  <div className="flex-1"><div className="text-[14px] font-bold">{it.name}</div><div className="text-[11px] text-faint">{it.category}</div></div>
                  <Pill text={it.status} fg={it.status === "Connected" ? "#4E7A4E" : it.status === "Coming soon" ? "#C68A1E" : "#9A9387"} bg={it.status === "Connected" ? "#EEF4EE" : it.status === "Coming soon" ? "#FBF8EE" : "#F2F0EB"} />
                </div>
                <div className="text-[12px] text-muted mb-3">{it.desc}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-faint">Last sync · {it.lastSync}</span>
                  <div className="flex gap-2">{it.actions.map((a) => <span key={a} className="text-[12px] font-bold rounded-[8px] px-3 py-[6px] cursor-pointer" style={(a === "Connect" || a === "Sync now") ? { background: "#211F1C", color: "#fff" } : { border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>{a}</span>)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === "templates" && (
          <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
            {TEMPLATES.map((t) => (
              <div key={t.name} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_0.8fr] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0">
                <div><div className="text-[13.5px] font-bold">{t.name}</div><div className="text-[11.5px] text-faint">{t.desc}</div></div>
                <div>{typePill(t.module)}</div>
                <div className="text-[12px] text-faint">Updated {t.updated}</div>
                <div><Pill text={t.status} fg={t.status === "Active" ? "#4E7A4E" : "#C68A1E"} bg={t.status === "Active" ? "#EEF4EE" : "#FBF8EE"} /></div>
              </div>
            ))}
          </div>
        )}

        {section === "audit" && (
          <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
            {AUDIT_LOG.map((a, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[1.1fr_1.5fr_1fr_1.6fr] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0">
                <div className="text-[11.5px] font-mono text-faint">{a.time}</div>
                <div><div className="text-[13px] font-semibold">{a.action}</div><div className="text-[11px] text-faint">by {a.user}</div></div>
                <div>{typePill(a.module)}</div>
                <div><div className="text-[11.5px] text-faint">{a.before}</div><div className="text-[11.5px] text-ink font-semibold">→ {a.after}</div></div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
