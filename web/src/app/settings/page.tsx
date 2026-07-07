"use client";

import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useRole } from "@/lib/role";
import { fetchMembers, createMember, fetchPermissions, savePermissions, fetchOrg, saveOrg, fetchNotifSettings, saveNotifSettings, fetchApprovalMatrix, saveApprovalMatrix, BudgetThreshold, ModuleRule } from "@/lib/db/settings";
import {
  NAV_DEF, SECTION_META, ORG_FIELDS, BRANDS_DATA, TEAMS_DATA, USERS_DATA,
  PERM_MODULES, PERM_ROLES, PERM_SCOPE_META, BUDGET_THRESHOLDS, APPROVAL_RULES,
  WF_MODULE_LABELS, STATUS_SETS, WfModule, NOTIF_CHANNELS, NOTIF_TRIGGERS,
  INTEGRATIONS, TEMPLATES, AUDIT_LOG, TYPE_COLOR, ROLE_OPTIONS,
} from "@/lib/data/settings";

const initials = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();

// Every branch across all brands — the scope options for a Branch Manager.
const BRANCHES: string[] = BRANDS_DATA.flatMap((b) => b.branchList);

function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return <span className="text-[11px] font-bold px-[9px] py-[3px] rounded-pill whitespace-nowrap inline-block" style={{ color: fg, background: bg }}>{text}</span>;
}

// Roles that can sit in an approval chain (superset of Users & Roles + finance tiers).
const APPROVER_ROLES = ["Requester", "Brand Lead", "CMO", "CFO", "CEO", "Finance", "Campaign Planner", "Senior Designer", "KOL Specialist"];

// ── Organization field editors — pickers instead of free text ─────────────
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMEZONES = ["Asia/Bangkok (UTC+7)", "Asia/Singapore (UTC+8)", "Asia/Tokyo (UTC+9)", "Asia/Jakarta (UTC+7)", "Asia/Ho_Chi_Minh (UTC+7)", "UTC"];
const CURRENCIES = ["Thai Baht (฿ THB)", "US Dollar ($ USD)", "Euro (€ EUR)", "Japanese Yen (¥ JPY)", "Singapore Dollar (S$ SGD)"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];
const selCls = "w-full text-[14px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none";

/** Editor for one org field, keyed off its label so dates/times/enums get the
 *  right control. Everything still composes back into the same display string
 *  the read view and DB already use — no schema change. */
function OrgFieldEditor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const l = label.toLowerCase();

  if (l === "timezone") return <select value={value} onChange={(e) => onChange(e.target.value)} className={selCls}>{[...new Set([value, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}</select>;
  if (l === "currency") return <select value={value} onChange={(e) => onChange(e.target.value)} className={selCls}>{[...new Set([value, ...CURRENCIES])].map((t) => <option key={t} value={t}>{t}</option>)}</select>;
  if (l === "date format") return <select value={value} onChange={(e) => onChange(e.target.value)} className={selCls}>{[...new Set([value, ...DATE_FORMATS])].map((t) => <option key={t} value={t}>{t}</option>)}</select>;

  if (l === "vat rate") {
    const n = parseFloat(value) || 0;
    const included = !/exclud/i.test(value);
    return (
      <div className="flex items-center gap-2">
        <input type="number" min={0} max={100} step={0.5} value={n} onChange={(e) => onChange(`${Number(e.target.value) || 0}% — ${included ? "included in" : "excluded from"} total`)} className="w-[80px] text-[14px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
        <span className="text-[13px] text-faint">%</span>
        <select value={included ? "in" : "ex"} onChange={(e) => onChange(`${n}% — ${e.target.value === "in" ? "included in" : "excluded from"} total`)} className="text-[13px] px-2 py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none">
          <option value="in">included in total</option>
          <option value="ex">excluded from total</option>
        </select>
      </div>
    );
  }

  if (l === "working hours") {
    const [a = "10:00", b = "19:00"] = value.split(/[—–-]/).map((s) => s.trim());
    const set = (start: string, end: string) => onChange(`${start} — ${end}`);
    return (
      <div className="flex items-center gap-2">
        <input type="time" value={a} onChange={(e) => set(e.target.value, b)} className="text-[14px] px-[11px] py-[7px] rounded-[9px] border border-line2 bg-ivory outline-none" />
        <span className="text-[13px] text-faint">—</span>
        <input type="time" value={b} onChange={(e) => set(a, e.target.value)} className="text-[14px] px-[11px] py-[7px] rounded-[9px] border border-line2 bg-ivory outline-none" />
      </div>
    );
  }

  if (l === "working days") {
    const [a = "Monday", b = "Friday"] = value.split(/[—–-]/).map((s) => s.trim());
    const set = (start: string, end: string) => onChange(`${start} — ${end}`);
    return (
      <div className="flex items-center gap-2">
        <select value={WEEKDAYS.includes(a) ? a : "Monday"} onChange={(e) => set(e.target.value, b)} className="text-[14px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none">{WEEKDAYS.map((d) => <option key={d}>{d}</option>)}</select>
        <span className="text-[13px] text-faint">—</span>
        <select value={WEEKDAYS.includes(b) ? b : "Friday"} onChange={(e) => set(a, e.target.value)} className="text-[14px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none">{WEEKDAYS.map((d) => <option key={d}>{d}</option>)}</select>
      </div>
    );
  }

  if (l === "fiscal year") {
    // Parse "April 2026 — December 2026" (year optional on the start side).
    const months = value.match(new RegExp(MONTHS_FULL.join("|"), "g")) ?? ["January", "December"];
    const years = value.match(/\d{4}/g) ?? [String(new Date().getFullYear())];
    const startM = months[0] ?? "January", endM = months[1] ?? "December";
    const startY = years[0] ?? String(new Date().getFullYear());
    const endY = years[1] ?? startY;
    const set = (sm: string, sy: string, em: string, ey: string) => onChange(`${sm} ${sy} — ${em} ${ey}`);
    const yearOpts = Array.from({ length: 7 }, (_, i) => String(2024 + i));
    const mSel = (v: string, on: (x: string) => void) => <select value={v} onChange={(e) => on(e.target.value)} className="text-[13.5px] px-[9px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none">{MONTHS_FULL.map((m) => <option key={m}>{m}</option>)}</select>;
    const ySel = (v: string, on: (x: string) => void) => <select value={v} onChange={(e) => on(e.target.value)} className="text-[13.5px] px-[9px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none">{[...new Set([v, ...yearOpts])].sort().map((y) => <option key={y}>{y}</option>)}</select>;
    return (
      <div className="flex items-center gap-[6px] flex-wrap">
        {mSel(startM, (m) => set(m, startY, endM, endY))}
        {ySel(startY, (y) => set(startM, y, endM, endY))}
        <span className="text-[13px] text-faint">—</span>
        {mSel(endM, (m) => set(startM, startY, m, endY))}
        {ySel(endY, (y) => set(startM, startY, endM, y))}
      </div>
    );
  }

  // Company name + anything else → plain text.
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={selCls} />;
}

/** Approval chain as ordered pills. Read-only shows arrows between roles; in
 *  edit mode each pill can be removed and a role appended from a dropdown. */
function ChainEditor({ chain, editable, onChange }: { chain: string[]; editable: boolean; onChange: (chain: string[]) => void }) {
  if (!editable) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {chain.map((c, i) => <span key={i} className="flex items-center gap-1"><Pill text={c} fg="#3E5C9A" bg="#EEF1F8" />{i < chain.length - 1 && <span className="text-faint text-[11px]">→</span>}</span>)}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {chain.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="flex items-center gap-1 text-[11px] font-bold px-[9px] py-[3px] rounded-pill" style={{ background: "#EEF1F8", color: "#3E5C9A" }}>
            {c}<button onClick={() => onChange(chain.filter((_, x) => x !== i))} className="text-[#3E5C9A]/60 hover:text-status-red font-bold ml-[1px]">×</button>
          </span>
          {i < chain.length - 1 && <span className="text-faint text-[11px]">→</span>}
        </span>
      ))}
      <select value="" onChange={(e) => { if (e.target.value) onChange([...chain, e.target.value]); }}
        className="text-[11px] font-semibold px-[8px] py-[4px] rounded-pill border border-line2 bg-white text-muted outline-none cursor-pointer">
        <option value="">+ role</option>
        {APPROVER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  );
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

// Avatar colors assigned to newly invited members.
const AVATAR_COLORS = ["#7A5C9E", "#2E7D74", "#B33A2E", "#C68A1E", "#3E5C9A", "#4E7A4E", "#B5577E"];
const ACCESS_STYLE: Record<string, { fg: string; bg: string }> = {
  Admin: { fg: "#B8945A", bg: "#FBF6ED" },
  Editor: { fg: "#3E5C9A", bg: "#EEF1F8" },
  Viewer: { fg: "#9A9387", bg: "#F2F0EB" },
};

export default function SettingsPage() {
  // Only the real CMO / Admin role may edit anything in Settings — everyone
  // else gets the read-only view. Driven by auth (or the demo role switcher).
  const { role } = useRole();
  const canEdit = role === "CMO / Admin";
  const [section, setSection] = useState("org");
  const [wfModule, setWfModule] = useState<WfModule>("campaign");
  // Notification toggles persist to org_settings; /api/notify honors them.
  const [channels, setChannelsRaw] = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_CHANNELS.map((c) => [c.key, c.def])));
  const [triggers, setTriggersRaw] = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_TRIGGERS.map((t) => [t.key, t.def])));
  const setChannels = (fn: (s: Record<string, boolean>) => Record<string, boolean>) =>
    setChannelsRaw((prev) => { const next = fn(prev); saveNotifSettings({ channels: next, triggers }); return next; });
  const setTriggers = (fn: (s: Record<string, boolean>) => Record<string, boolean>) =>
    setTriggersRaw((prev) => { const next = fn(prev); saveNotifSettings({ channels, triggers: next }); return next; });
  useEffect(() => {
    let alive = true;
    fetchNotifSettings().then((s) => {
      if (!alive || !s) return;
      setChannelsRaw((d) => ({ ...d, ...s.channels }));
      setTriggersRaw((d) => ({ ...d, ...s.triggers }));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Editable permission matrix (role × module) as level indices.
  const [perm, setPerm] = useState<number[][]>(() => PERM_ROLES.map((r) => r.perms.map((p) => levelIndex(p.l))));
  const [permDirty, setPermDirty] = useState(false);
  const cyclePerm = (ri: number, mi: number) => {
    if (!canEdit) return;
    setPerm((m) => m.map((row, r) => (r === ri ? row.map((v, c) => (c === mi ? (v + 1) % PERM_LEVELS.length : v)) : row)));
    setPermDirty(true);
  };
  const persistPermissions = () => {
    savePermissions(PERM_ROLES.map((r, ri) => ({
      role: r.role, descr: r.desc,
      perms: PERM_MODULES.map((m, mi) => ({ module: m, level: PERM_LEVELS[perm[ri][mi]].l })),
    })));
    setPermDirty(false);
  };
  // Editable organization fields
  const [orgEdit, setOrgEdit] = useState(false);
  const [org, setOrg] = useState(() => ORG_FIELDS.map((f) => ({ ...f })));
  const persistOrg = () => { saveOrg(org); setOrgEdit(false); };

  // Editable Approval Matrix (budget thresholds + module rules).
  const [thresholds, setThresholds] = useState<BudgetThreshold[]>(() => BUDGET_THRESHOLDS.map((b) => ({ ...b, chain: [...b.chain] })));
  const [rules, setRules] = useState<ModuleRule[]>(() => APPROVAL_RULES.map((r) => ({ ...r, chain: [...r.chain] })));
  const [apprEdit, setApprEdit] = useState(false);
  const [apprDirty, setApprDirty] = useState(false);
  const persistApproval = () => { saveApprovalMatrix({ thresholds, rules }); setApprEdit(false); setApprDirty(false); };

  // Load saved permissions + org from Supabase.
  useEffect(() => {
    let alive = true;
    fetchPermissions().then((map) => {
      if (!alive || !map) return;
      setPerm(PERM_ROLES.map((r) => r.perms.map((p, mi) => {
        const lvl = map[r.role]?.[PERM_MODULES[mi]];
        return lvl ? levelIndex(lvl) : levelIndex(p.l);
      })));
    }).catch(() => {});
    fetchOrg().then((f) => { if (alive && f && f.length) setOrg(f); }).catch(() => {});
    fetchApprovalMatrix().then((m) => {
      if (!alive || !m) return;
      if (m.thresholds.length) setThresholds(m.thresholds);
      if (m.rules.length) setRules(m.rules);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Team members (invitable) — loaded from Supabase when configured.
  const [users, setUsers] = useState(() => USERS_DATA.map((u) => ({ ...u })));
  useEffect(() => {
    let alive = true;
    fetchMembers().then((m) => { if (alive) setUsers(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
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
    const member = {
      name: inv.name.trim(), email: inv.email.trim(), role: inv.role.trim() || "Member",
      access: inv.access, brandAccess: inv.brandAccess, status: "Invited",
      color: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
    };
    setUsers((us) => [...us, member]);
    createMember(member);
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
              : <>Read-only for <b>{role}</b>. Only <b>CMO / Admin</b> can change settings.</>}
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
                ? <button onClick={persistOrg} className="text-[12px] font-bold text-white bg-status-green rounded-[8px] px-3 py-[7px]">Save</button>
                : <button onClick={() => setOrgEdit(true)} className="text-[12px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[7px]">Edit</button>)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {org.map((f, i) => (
                <div key={f.label}>
                  <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{f.label}</div>
                  {orgEdit
                    ? <OrgFieldEditor label={f.label} value={f.value} onChange={(v) => setOrg((o) => o.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
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
                  <button onClick={persistPermissions} className="text-[12px] font-bold text-white bg-status-green rounded-[8px] px-3 py-[6px]">Save changes</button>
                </div>
              )}
            </div>
            <div className="bg-surface border border-line rounded-cardLg overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr className="border-b border-line4"><th className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold px-4 py-3">Role</th><th className="text-[10px] uppercase tracking-[0.04em] text-faint font-bold px-2 py-3 text-center">Scope</th>{PERM_MODULES.map((m) => <th key={m} className="text-[10px] uppercase tracking-[0.04em] text-faint font-bold px-2 py-3 text-center">{m}</th>)}</tr>
                </thead>
                <tbody>
                  {PERM_ROLES.map((r, ri) => {
                    const sc = PERM_SCOPE_META[r.scope];
                    return (
                    <tr key={r.role} className="border-b border-line4 last:border-0">
                      <td className="px-4 py-3"><div className="text-[13px] font-bold">{r.role}</div><div className="text-[11px] text-faint">{r.desc}</div></td>
                      <td className="px-2 py-3 text-center">
                        <span className="text-[10.5px] font-bold px-2 py-[3px] rounded-[6px] whitespace-nowrap" style={{ background: sc.b, color: sc.c }}>{sc.label}</span>
                      </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === "approval" && (
          <div className="flex flex-col gap-5">
            {/* Edit toolbar — CMO / Admin only */}
            {canEdit && (
              <div className="flex items-center justify-end gap-2">
                {apprEdit ? (
                  <>
                    <button onClick={() => { setThresholds(BUDGET_THRESHOLDS.map((b) => ({ ...b, chain: [...b.chain] }))); setRules(APPROVAL_RULES.map((r) => ({ ...r, chain: [...r.chain] }))); setApprEdit(false); setApprDirty(false); fetchApprovalMatrix().then((m) => { if (m) { if (m.thresholds.length) setThresholds(m.thresholds); if (m.rules.length) setRules(m.rules); } }); }}
                      className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">Cancel</button>
                    <button onClick={persistApproval} disabled={!apprDirty}
                      className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px] disabled:opacity-40">Save changes</button>
                  </>
                ) : (
                  <button onClick={() => setApprEdit(true)} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px]">✏️ Edit matrix</button>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-bold">Budget Threshold Approval</div>
                {apprEdit && <button onClick={() => { setThresholds((ts) => [...ts, { range: "฿ new tier", approver: "", chain: ["Brand Lead"] }]); setApprDirty(true); }} className="text-[11.5px] font-bold text-accent">+ Add tier</button>}
              </div>
              <div className="flex flex-col gap-2">
                {thresholds.map((b, ti) => (
                  <div key={ti} className="bg-surface border border-line rounded-card p-4 flex items-start gap-4 flex-wrap">
                    <div className="min-w-[160px]">
                      {apprEdit ? (
                        <>
                          <input value={b.range} onChange={(e) => { setThresholds((ts) => ts.map((x, i) => i === ti ? { ...x, range: e.target.value } : x)); setApprDirty(true); }} className="w-full text-[13px] font-bold px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none mb-1" />
                          <input value={b.approver} placeholder="short note" onChange={(e) => { setThresholds((ts) => ts.map((x, i) => i === ti ? { ...x, approver: e.target.value } : x)); setApprDirty(true); }} className="w-full text-[11.5px] text-faint px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                        </>
                      ) : (
                        <><div className="text-[13.5px] font-bold">{b.range}</div><div className="text-[11.5px] text-faint">{b.approver}</div></>
                      )}
                    </div>
                    <ChainEditor chain={b.chain} editable={apprEdit}
                      onChange={(chain) => { setThresholds((ts) => ts.map((x, i) => i === ti ? { ...x, chain } : x)); setApprDirty(true); }} />
                    {apprEdit && <button onClick={() => { setThresholds((ts) => ts.filter((_, i) => i !== ti)); setApprDirty(true); }} className="ml-auto text-[12px] text-status-red font-bold">✕</button>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-3">Module Approval Rules</div>
              <div className="flex flex-col gap-2">
                {rules.map((r, ri) => (
                  <div key={ri} className="bg-surface border border-line rounded-card p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[16px]">{r.icon}</span><span className="text-[13.5px] font-bold">{r.module}</span>
                      <div className="ml-2"><ChainEditor chain={r.chain} editable={apprEdit}
                        onChange={(chain) => { setRules((rs) => rs.map((x, i) => i === ri ? { ...x, chain } : x)); setApprDirty(true); }} /></div>
                    </div>
                    {apprEdit ? (
                      <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-faint">
                        {(["sla", "escalate", "remind"] as const).map((k) => (
                          <label key={k} className="flex items-center gap-1">{k === "sla" ? "SLA" : k === "escalate" ? "escalate" : "remind"}
                            <input type="number" min={0} value={r[k]} onChange={(e) => { const v = Number(e.target.value) || 0; setRules((rs) => rs.map((x, i) => i === ri ? { ...x, [k]: v } : x)); setApprDirty(true); }} className="w-[52px] text-[11.5px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />d</label>
                        ))}
                        <label className="flex items-center gap-1">backup
                          <input value={r.backup} onChange={(e) => { setRules((rs) => rs.map((x, i) => i === ri ? { ...x, backup: e.target.value } : x)); setApprDirty(true); }} className="w-[110px] text-[11.5px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" /></label>
                      </div>
                    ) : (
                      <div className="text-[11.5px] text-faint">SLA {r.sla}d · escalate {r.escalate}d · remind every {r.remind}d · backup {r.backup}</div>
                    )}
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
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand / branch scope</label>
                  <select value={inv.brandAccess} onChange={(e) => setInv({ ...inv, brandAccess: e.target.value })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                    <optgroup label="Brand">
                      <option>All brands</option><option>Teppen</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option>
                    </optgroup>
                    <optgroup label="Single branch">
                      {BRANCHES.map((br) => <option key={br} value={`Branch · ${br}`}>Branch · {br}</option>)}
                    </optgroup>
                    <option>External only</option>
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
