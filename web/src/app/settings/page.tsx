"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import {
  NAV_DEF, SECTION_META, ORG_FIELDS, BRANDS_DATA, TEAMS_DATA, USERS_DATA,
  PERM_MODULES, PERM_ROLES, BUDGET_THRESHOLDS, APPROVAL_RULES,
  WF_MODULE_LABELS, STATUS_SETS, WfModule, NOTIF_CHANNELS, NOTIF_TRIGGERS,
  INTEGRATIONS, TEMPLATES, AUDIT_LOG, TYPE_COLOR, ROLE_OPTIONS,
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

// Permission levels admins can cycle a cell through (visibility → full edit).
const PERM_LEVELS: { l: string; c: string; b: string }[] = [
  { l: "—", c: "#C0B8AD", b: "#F2F0EB" },
  { l: "View", c: "#9A9387", b: "#F2F0EB" },
  { l: "Comment", c: "#6b6258", b: "#F0EDE6" },
  { l: "Edit", c: "#3E5C9A", b: "#EEF1F8" },
  { l: "Approve", c: "#4E7A4E", b: "#EEF4EE" },
  { l: "Admin", c: "#B8945A", b: "#FBF6ED" },
];
const levelIndex = (label: string) => Math.max(0, PERM_LEVELS.findIndex((p) => p.l === label));

// The current viewer's role. CMO / Admin can edit everything in Settings.
const CURRENT_ROLE = "CMO / Admin";
const canEdit = CURRENT_ROLE === "CMO / Admin";

// Avatar colors assigned to newly invited members.
const AVATAR_COLORS = ["#7A5C9E", "#2E7D74", "#B33A2E", "#C68A1E", "#3E5C9A", "#4E7A4E", "#B5577E"];
const ACCESS_STYLE: Record<string, { fg: string; bg: string }> = {
  Admin: { fg: "#B8945A", bg: "#FBF6ED" },
  Editor: { fg: "#3E5C9A", bg: "#EEF1F8" },
  Viewer: { fg: "#9A9387", bg: "#F2F0EB" },
};

export default function SettingsPage() {
  const [section, setSection] = useState("org");
  const [wfModule, setWfModule] = useState<WfModule>("campaign");
  const [channels, setChannels] = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_CHANNELS.map((c) => [c.key, c.def])));
  const [triggers, setTriggers] = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_TRIGGERS.map((t) => [t.key, t.def])));
  // Editable permission matrix (role × module) as level indices.
  const [perm, setPerm] = useState<number[][]>(() => PERM_ROLES.map((r) => r.perms.map((p) => levelIndex(p.l))));
  const [permDirty, setPermDirty] = useState(false);
  const cyclePerm = (ri: number, mi: number) => {
    if (!canEdit) return;
    setPerm((m) => m.map((row, r) => (r === ri ? row.map((v, c) => (c === mi ? (v + 1) % PERM_LEVELS.length : v)) : row)));
    setPermDirty(true);
  };
  // Editable organization fields
  const [orgEdit, setOrgEdit] = useState(false);
  const [org, setOrg] = useState(() => ORG_FIELDS.map((f) => ({ ...f })));
  // Team members (invitable)
  const [users, setUsers] = useState(() => USERS_DATA.map((u) => ({ ...u })));
  const [inviteOpen, setInviteOpen] = useState(false);
  const emptyInvite = { name: "", email: "", role: "Campaign Planner", access: "Editor", brandAccess: "All brands" };
  const [inv, setInv] = useState(emptyInvite);
  // Picking a role opens/closes its default view/edit access + brand scope.
  const pickRole = (role: string) => {
    const opt = ROLE_OPTIONS.find((o) => o.role === role);
    setInv((v) => ({ ...v, role, access: opt?.access ?? v.access, brandAccess: opt?.brand ?? v.brandAccess }));
  };
  const inviteValid = inv.name.trim() !== "" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inv.email.trim());
  const submitInvite = () => {
    if (!canEdit || !inviteValid) return;
    setUsers((us) => [...us, {
      name: inv.name.trim(), email: inv.email.trim(), role: inv.role.trim() || "Member",
      access: inv.access, brandAccess: inv.brandAccess, status: "Invited",
      color: AVATAR_COLORS[us.length % AVATAR_COLORS.length],
    }]);
    setInviteOpen(false);
    setInv(emptyInvite);
  };
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
        <div className="mb-4">
          <div className="text-[20px] font-extrabold tracking-[-0.01em]">{meta.title}</div>
          <div className="text-[13px] text-faint mt-1">{meta.desc}</div>
        </div>

        {/* Admin access banner */}
        <div className="mb-5 flex items-center gap-3 rounded-card px-4 py-[10px]" style={{ background: canEdit ? "#FBF6ED" : "#F2F0EB", border: `1px solid ${canEdit ? "#E8D5AA" : "#E5DECF"}` }}>
          <span className="text-[15px]">{canEdit ? "🔓" : "🔒"}</span>
          <div className="text-[12.5px]" style={{ color: canEdit ? "#8A6A2E" : "#6b6258" }}>
            {canEdit
              ? <>Signed in as <b>CMO / Admin</b> — you can edit everything here, including view and edit permissions.</>
              : <>Read-only. Only <b>CMO / Admin</b> can change settings.</>}
          </div>
        </div>

        {/* Mobile section picker */}
        <div className="md:hidden mb-4">
          <select value={section} onChange={(e) => setSection(e.target.value)} className="w-full text-[14px] px-3 py-[10px] rounded-[10px] border border-line2 bg-white">
            {NAV_DEF.flatMap((g) => g.items).map((it) => <option key={it.id} value={it.id}>{it.icon} {it.label}</option>)}
          </select>
        </div>

        {section === "org" && (
          <div className="bg-surface border border-line rounded-cardLg p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="text-[13px] font-bold">Company details</div>
              {canEdit && (orgEdit
                ? <button onClick={() => setOrgEdit(false)} className="text-[12px] font-bold text-white bg-status-green rounded-[8px] px-3 py-[7px]">Save</button>
                : <button onClick={() => setOrgEdit(true)} className="text-[12px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[7px]">Edit</button>)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {org.map((f, i) => (
                <div key={f.label}>
                  <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{f.label}</div>
                  {orgEdit
                    ? <input value={f.value} onChange={(e) => setOrg((o) => o.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="w-full text-[14px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
                    : <div className="text-[14px] font-semibold text-ink">{f.value}</div>}
                </div>
              ))}
            </div>
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
            <div className="flex items-center justify-between px-5 py-3 border-b border-line4">
              <div className="text-[13px] font-bold">{users.length} members</div>
              <button onClick={() => canEdit && setInviteOpen(true)} disabled={!canEdit}
                className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[7px] disabled:opacity-40 disabled:cursor-default">+ Invite</button>
            </div>
            {users.map((u) => {
              const acc = ACCESS_STYLE[u.access] ?? ACCESS_STYLE.Viewer;
              const invited = u.status === "Invited";
              return (
                <div key={u.email} className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1fr_1.2fr_0.8fr] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0">
                  <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: u.color }}>{initials(u.name)}</span><div><div className="text-[13.5px] font-bold">{u.name}</div><div className="text-[11px] text-faint">{u.email}</div></div></div>
                  <div className="text-[12.5px] text-muted">{u.role}</div>
                  <div><Pill text={u.access} fg={acc.fg} bg={acc.bg} /></div>
                  <div className="text-[12px] text-muted">{u.brandAccess}</div>
                  <div><Pill text={u.status} fg={invited ? "#C68A1E" : "#4E7A4E"} bg={invited ? "#FBF8EE" : "#EEF4EE"} /></div>
                </div>
              );
            })}
          </div>
        )}

        {section === "perms" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap text-[11px]">
                {canEdit && <span className="text-faint font-semibold">Click a cell to change · </span>}
                {PERM_LEVELS.map((p) => <span key={p.l} className="font-bold px-2 py-[2px] rounded-[6px]" style={{ background: p.b, color: p.c }}>{p.l}</span>)}
              </div>
              {canEdit && permDirty && (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setPerm(PERM_ROLES.map((r) => r.perms.map((p) => levelIndex(p.l)))); setPermDirty(false); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[6px]">Reset</button>
                  <button onClick={() => setPermDirty(false)} className="text-[12px] font-bold text-white bg-status-green rounded-[8px] px-3 py-[6px]">Save changes</button>
                </div>
              )}
            </div>
            <div className="bg-surface border border-line rounded-cardLg overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr className="border-b border-line4"><th className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold px-4 py-3">Role</th>{PERM_MODULES.map((m) => <th key={m} className="text-[10px] uppercase tracking-[0.04em] text-faint font-bold px-2 py-3 text-center">{m}</th>)}</tr>
                </thead>
                <tbody>
                  {PERM_ROLES.map((r, ri) => (
                    <tr key={r.role} className="border-b border-line4 last:border-0">
                      <td className="px-4 py-3"><div className="text-[13px] font-bold">{r.role}</div><div className="text-[11px] text-faint">{r.desc}</div></td>
                      {r.perms.map((_, mi) => {
                        const lvl = PERM_LEVELS[perm[ri][mi]];
                        return (
                          <td key={mi} className="px-2 py-3 text-center">
                            <button onClick={() => cyclePerm(ri, mi)} disabled={!canEdit}
                              className="text-[10.5px] font-bold px-2 py-[3px] rounded-[6px] whitespace-nowrap transition disabled:cursor-default"
                              style={{ background: lvl.b, color: lvl.c, cursor: canEdit ? "pointer" : "default", boxShadow: canEdit ? "0 0 0 1px rgba(0,0,0,0.03)" : undefined }}>
                              {lvl.l}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Invite member modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setInviteOpen(false)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-1">
              <div className="text-[16px] font-extrabold">Invite member</div>
              <button onClick={() => setInviteOpen(false)} className="text-[18px] text-faint leading-none -mt-1">✕</button>
            </div>
            <div className="text-[12px] text-faint mb-5">They’ll receive an email invite to join the TEPPEN Marketing OS.</div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Full name <span className="text-status-red">*</span></label>
                <input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} placeholder="e.g. Somchai P." className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Email <span className="text-status-red">*</span></label>
                <input value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="name@teppenthailand.co.th" className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Role / position</label>
                <select value={inv.role} onChange={(e) => pickRole(e.target.value)} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                  {ROLE_OPTIONS.map((o) => <option key={o.role} value={o.role}>{o.role}{o.external ? " · external" : ""}</option>)}
                </select>
                <div className="text-[11px] text-faint mt-[5px]">Sets default view / edit access — fine-tune per role in <b className="text-muted">Permissions</b>.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Access level</label>
                  <select value={inv.access} onChange={(e) => setInv({ ...inv, access: e.target.value })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                    <option>Admin</option><option>Editor</option><option>Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand access</label>
                  <select value={inv.brandAccess} onChange={(e) => setInv({ ...inv, brandAccess: e.target.value })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                    <option>All brands</option><option>Teppen</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option><option>External only</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={submitInvite} disabled={!inviteValid}
                className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40 disabled:cursor-default">Send invite</button>
              <button onClick={() => setInviteOpen(false)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
