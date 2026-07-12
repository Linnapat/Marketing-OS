"use client";

import { useEffect, useState } from "react";
import { CampaignPageHeaderSection, ModuleSummaryCard } from "@/components/campaign/CampaignHeadController";
import { clsx } from "@/lib/clsx";
import { useRole } from "@/lib/role";
import { DatePicker } from "@/components/ui/DatePicker";
import { fetchMembers, createMember, updateMember, deleteMember, fetchPermissions, savePermissions, fetchOrg, saveOrg, fetchNotifSettings, saveNotifSettings, fetchApprovalMatrix, saveApprovalMatrix, fetchJsonSetting, saveJsonSetting, BudgetThreshold, ModuleRule, Member } from "@/lib/db/settings";
import {
  NAV_DEF, SECTION_META, ORG_FIELDS, BRANDS_DATA, TEAMS_DATA, USERS_DATA,
  PERM_MODULES, PERM_ROLES, PERM_SCOPE_META, BUDGET_THRESHOLDS, APPROVAL_RULES,
  WF_MODULE_LABELS, STATUS_SETS, WfModule, WfStatus, NOTIF_CHANNELS, NOTIF_TRIGGERS,
  INTEGRATIONS, TEMPLATES, AUDIT_LOG, TYPE_COLOR, ROLE_OPTIONS,
} from "@/lib/data/settings";

const initials = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();

// Every branch across all brands — the scope options for a Branch Manager.
const BRANCHES: string[] = BRANDS_DATA.flatMap((b) => b.branchList);
const BRAND_SCOPE_BRANDS = BRANDS_DATA.map((b) => b.name.replace(/\s+Thailand$/i, ""));
const BRAND_SCOPE_LABELS = ["All brands", "External only", "Selected brands"];
const BRAND_SCOPE_TEXT = "Teppen · Omakase Don";

function normalizeScopeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitBrandScope(value: string): string[] {
  return normalizeScopeText(value)
    .replace(/^Branch\s*·\s*/i, "")
    .split(/[·,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function toggleBrandScope(current: string, brand: string): string {
  const normalized = normalizeScopeText(current);
  if (normalized === "All brands" || normalized === "External only" || /^Branch\s*·/i.test(normalized)) return brand;
  const picked = new Set(splitBrandScope(normalized));
  if (picked.has(brand)) picked.delete(brand);
  else picked.add(brand);
  return [...picked].join(" · ");
}

function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return <span className="text-[11px] font-bold px-[9px] py-[3px] rounded-pill whitespace-nowrap inline-block" style={{ color: fg, background: bg }}>{text}</span>;
}

// Roles that can sit in an approval chain (superset of Users & Roles + finance tiers).
const APPROVER_ROLES = ["Requester", "Marketing Manager / BGL", "Creative Leader", "Marketing Executive", "Senior Graphic Designer", "VDO Editor", "Co-ordinator", "KOL Specialist", "Content Creator", "CMO", "CFO", "CEO", "Agency (External)"];

// "Jul 7, 2026" — the stamp new/edited templates carry.
const todayLabel = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Editable list of tag pills (branches, team members). Read-only shows plain
 *  pills; edit mode adds an ✕ per pill and a small input to append. */
function BranchEditor({ branches, editable, placeholder = "branch", onChange }: { branches: string[]; editable: boolean; placeholder?: string; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  if (!editable) {
    return <div className="flex flex-wrap gap-[6px]">{branches.map((br) => <span key={br} className="text-[11px] font-semibold text-muted bg-ivory border border-line3 rounded-pill px-[9px] py-[3px]">{br}</span>)}{!branches.length && <span className="text-[11px] text-faint">—</span>}</div>;
  }
  const add = () => { const v = draft.trim(); if (v && !branches.includes(v)) onChange([...branches, v]); setDraft(""); };
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {branches.map((br, i) => (
        <span key={i} className="flex items-center gap-1 text-[11px] font-semibold text-muted bg-ivory border border-line3 rounded-pill px-[9px] py-[3px]">
          {br}<button onClick={() => onChange(branches.filter((_, j) => j !== i))} className="text-faint hover:text-status-red font-bold">×</button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add}
        placeholder={`+ ${placeholder}`} className="text-[11px] w-[92px] px-[8px] py-[3px] rounded-pill border border-line2 bg-white outline-none" />
    </div>
  );
}

function BrandScopeEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const normalized = normalizeScopeText(value);
  const selectedBrands = splitBrandScope(normalized);
  const isAll = normalized === "All brands";
  const isExternal = normalized === "External only";
  const branchValue = /^Branch\s*·\s*/i.test(normalized) ? normalized.replace(/^Branch\s*·\s*/i, "").trim() : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {BRAND_SCOPE_LABELS.map((label) => {
          const active = normalized === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(label)}
              className="text-[11.5px] font-bold px-3 py-[6px] rounded-pill border"
              style={active ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { background: "#fff", color: "#6b6258", borderColor: "#E5DECF" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {!isAll && !isExternal && (
        <>
          <div>
            <div className="text-[11px] font-bold text-faint mb-[6px]">เลือกหลายแบรนด์ได้</div>
            <div className="flex flex-wrap gap-2">
              {BRAND_SCOPE_BRANDS.map((brand) => {
                const active = selectedBrands.includes(brand) && !branchValue;
                return (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => onChange(toggleBrandScope(normalized, brand))}
                    className="text-[11.5px] font-bold px-3 py-[6px] rounded-pill border"
                    style={active ? { background: "#EEF1F8", color: "#3E5C9A", borderColor: "#C9D4EE" } : { background: "#fff", color: "#6b6258", borderColor: "#E5DECF" }}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-faint mb-[6px]">หรือกำหนดเป็นสาขาเดียว</div>
            <select value={branchValue} onChange={(e) => onChange(e.target.value ? `Branch · ${e.target.value}` : "")} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
              <option value="">No branch limit</option>
              {BRANCHES.map((br) => <option key={br} value={br}>{br}</option>)}
            </select>
          </div>
        </>
      )}

      <div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={BRAND_SCOPE_TEXT}
          className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none"
        />
        <div className="text-[11px] text-faint mt-[5px]">เช่น {BRAND_SCOPE_TEXT} หรือ Branch · Central World</div>
      </div>
    </div>
  );
}

// ── Organization field editors — pickers instead of free text ─────────────
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMEZONES = ["Asia/Bangkok (UTC+7)", "Asia/Singapore (UTC+8)", "Asia/Tokyo (UTC+9)", "Asia/Jakarta (UTC+7)", "Asia/Ho_Chi_Minh (UTC+7)", "UTC"];
const CURRENCIES = ["Thai Baht (฿ THB)", "US Dollar ($ USD)", "Euro (€ EUR)", "Japanese Yen (¥ JPY)", "Singapore Dollar (S$ SGD)"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];
const SHORT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const selCls = "w-full text-[14px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none";

/** ISO date → "1 Apr 2026" for the fiscal-year display string. */
function fiscalLabel(iso: string): string {
  const [y, m, d] = (iso || "").split("-").map(Number);
  return y && m && d ? `${d} ${SHORT_MON[m - 1]} ${y}` : "";
}

/** Parse a saved fiscal-year string into [startIso, endIso]. Handles the new
 *  "1 Apr 2026 — 31 Dec 2026" and the old month-only "April 2026 — December 2026"
 *  (start → first of month, end → last of month). */
function parseFiscalRange(value: string): [string, string] {
  const parts = value.split(/[—–]/).map((s) => s.trim());
  const thisYear = new Date().getFullYear();
  const one = (s: string, isEnd: boolean): string => {
    const year = Number(s.match(/\d{4}/)?.[0]) || thisYear;
    const monIdx = MONTHS_FULL.findIndex((m) => new RegExp(m, "i").test(s));
    const shortIdx = SHORT_MON.findIndex((m) => new RegExp(`\\b${m}\\b`, "i").test(s));
    const mi = monIdx >= 0 ? monIdx : shortIdx >= 0 ? shortIdx : (isEnd ? 11 : 0);
    const day = Number(s.match(/\b(\d{1,2})\b/)?.[1]) || (isEnd ? new Date(year, mi + 1, 0).getDate() : 1);
    return `${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  return [one(parts[0] ?? "", false), one(parts[1] ?? parts[0] ?? "", true)];
}

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
    // Full calendar control — CMO picks the exact start & end day. Parses the
    // saved string back into ISO (handles "1 Apr 2026 — 31 Dec 2026" and the
    // older month-only "April 2026 — December 2026").
    const [startIso, endIso] = parseFiscalRange(value);
    const set = (s: string, e: string) => onChange(`${fiscalLabel(s)} — ${fiscalLabel(e)}`);
    return (
      <div className="flex items-center gap-[6px] flex-wrap">
        <div className="min-w-[150px]"><DatePicker value={startIso} onChange={(v) => set(v, endIso)} placeholder="Start date" /></div>
        <span className="text-[13px] text-faint">—</span>
        <div className="min-w-[150px]"><DatePicker value={endIso} min={startIso} onChange={(v) => set(startIso, v)} placeholder="End date" /></div>
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
  // Only the real CMO role may edit anything in Settings — everyone
  // else gets the read-only view. Driven by auth (or the demo role switcher).
  const { role } = useRole();
  const canEdit = role === "CMO";
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

  // Editable Brands & Branches (persisted as a JSON blob in org_settings).
  type BrandCfg = typeof BRANDS_DATA[number];
  const [brands, setBrands] = useState<BrandCfg[]>(() => BRANDS_DATA.map((b) => ({ ...b, branchList: [...b.branchList] })));
  const [brandsEdit, setBrandsEdit] = useState(false);
  const [brandsDirty, setBrandsDirty] = useState(false);
  const editBrand = (i: number, patch: Partial<BrandCfg>) => { setBrands((bs) => bs.map((b, j) => j === i ? { ...b, ...patch } : b)); setBrandsDirty(true); };
  const persistBrands = () => { saveJsonSetting("brands_config", "Brands & branches", brands); setBrandsEdit(false); setBrandsDirty(false); };

  // Editable Teams (JSON blob in org_settings).
  type TeamCfg = typeof TEAMS_DATA[number];
  const [teams, setTeams] = useState<TeamCfg[]>(() => TEAMS_DATA.map((t) => ({ ...t, members: [...t.members] })));
  const [teamsEdit, setTeamsEdit] = useState(false);
  const [teamsDirty, setTeamsDirty] = useState(false);
  const editTeam = (i: number, patch: Partial<TeamCfg>) => { setTeams((ts) => ts.map((t, j) => j === i ? { ...t, ...patch } : t)); setTeamsDirty(true); };
  const persistTeams = () => { saveJsonSetting("teams_config", "Teams", teams); setTeamsEdit(false); setTeamsDirty(false); };

  // Editable Workflow Status per module (JSON blob in org_settings).
  const [statusSets, setStatusSets] = useState<Record<WfModule, WfStatus[]>>(() =>
    Object.fromEntries((Object.keys(STATUS_SETS) as WfModule[]).map((m) => [m, STATUS_SETS[m].map((s) => ({ ...s }))])) as Record<WfModule, WfStatus[]>);
  const [wfEdit, setWfEdit] = useState(false);
  const [wfDirty, setWfDirty] = useState(false);
  const editStatuses = (mod: WfModule, next: WfStatus[]) => { setStatusSets((s) => ({ ...s, [mod]: next.map((x, i) => ({ ...x, order: i + 1 })) })); setWfDirty(true); };
  const persistWorkflow = () => { saveJsonSetting("workflow_status", "Workflow statuses", statusSets); setWfEdit(false); setWfDirty(false); };

  // Editable Templates (JSON blob in org_settings).
  type TemplateCfg = typeof TEMPLATES[number];
  const [templates, setTemplates] = useState<TemplateCfg[]>(() => TEMPLATES.map((t) => ({ ...t })));
  const [tplEdit, setTplEdit] = useState(false);
  const [tplDirty, setTplDirty] = useState(false);
  const editTpl = (i: number, patch: Partial<TemplateCfg>) => { setTemplates((ts) => ts.map((t, j) => j === i ? { ...t, ...patch, updated: todayLabel() } : t)); setTplDirty(true); };
  const persistTemplates = () => { saveJsonSetting("templates_config", "Templates", templates); setTplEdit(false); setTplDirty(false); };

  // Edit-existing-member modal.
  const [editUser, setEditUser] = useState<{ orig: string; m: Member } | null>(null);

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
    fetchJsonSetting<BrandCfg[]>("brands_config").then((b) => { if (alive && b?.length) setBrands(b); }).catch(() => {});
    fetchJsonSetting<TeamCfg[]>("teams_config").then((t) => { if (alive && t?.length) setTeams(t); }).catch(() => {});
    fetchJsonSetting<Record<WfModule, WfStatus[]>>("workflow_status").then((w) => { if (alive && w) setStatusSets((cur) => ({ ...cur, ...w })); }).catch(() => {});
    fetchJsonSetting<TemplateCfg[]>("templates_config").then((t) => { if (alive && t?.length) setTemplates(t); }).catch(() => {});
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
  const emptyInvite = { name: "", email: "", role: "Marketing Executive", access: "Editor", brandAccess: "Selected brands" };
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
    <>
      <CampaignPageHeaderSection
        eyebrow="TEAM SETTINGS"
        title="Settings"
        description="Control people, permissions, workflow rules, and company-wide defaults for the whole OS."
      />

      <div className="mt-5">
        <ModuleSummaryCard
          title="Settings Access"
          style={{
            background: "linear-gradient(135deg, #FFF8E9 0%, #FFFDF5 100%)",
            border: "1px solid #E9D7A3",
            boxShadow: "0 18px 44px rgba(184, 148, 90, 0.14)",
          }}
          titleClassName="text-[#8A6A2E]"
        >
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-[22px] p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(138,106,46,0.14)" }}>
              <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A6A2E]">Current section</div>
              <div className="mt-2 text-[22px] font-extrabold text-ink">{meta.title}</div>
              <div className="mt-2 text-[13px] text-[#6F6659]">{meta.desc}</div>
            </div>
            <div className="rounded-[22px] p-4" style={{ background: canEdit ? "rgba(255,255,255,0.78)" : "rgba(242,240,235,0.92)", border: `1px solid ${canEdit ? "rgba(138,106,46,0.14)" : "rgba(107,98,88,0.14)"}` }}>
              <div className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: canEdit ? "#8A6A2E" : "#6b6258" }}>Access</div>
              <div className="mt-3 text-[14px]" style={{ color: canEdit ? "#8A6A2E" : "#6b6258" }}>
                {canEdit
                  ? <>🔓 Signed in as <b>CMO</b> — you can edit everything here.</>
                  : <>🔒 Read-only for <b>{role}</b>. Only <b>CMO</b> can change settings.</>}
              </div>
            </div>
          </div>
        </ModuleSummaryCard>
      </div>

      <div className="mt-5 flex gap-6 items-start">
      {/* Sidebar */}
      <aside className="w-[228px] flex-shrink-0 sticky top-5 hidden md:block rounded-[24px] border border-[#ECEAF2] bg-white p-4 shadow-[0_10px_30px_rgba(23,23,42,0.05)]">
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
              ? <>Signed in as <b>CMO</b> — you can edit everything here, including view and edit permissions.</>
              : <>Read-only for <b>{role}</b>. Only <b>CMO</b> can change settings.</>}
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
          <div className="flex flex-col gap-3">
            {canEdit && (
              <div className="flex items-center justify-end gap-2">
                {brandsEdit ? (
                  <>
                    <button onClick={() => { setBrands(BRANDS_DATA.map((b) => ({ ...b, branchList: [...b.branchList] }))); setBrandsEdit(false); setBrandsDirty(false); fetchJsonSetting<BrandCfg[]>("brands_config").then((b) => { if (b?.length) setBrands(b); }); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">Cancel</button>
                    <button onClick={() => { setBrands((bs) => [...bs, { key: `brand-${Date.now()}`, name: "New brand", color: "#B8945A", lead: "", branches: 0, campaigns: 0, budget: "฿0", branchList: [] }]); setBrandsDirty(true); }} className="text-[12px] font-bold text-accent border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">+ Add brand</button>
                    <button onClick={persistBrands} disabled={!brandsDirty} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px] disabled:opacity-40">Save changes</button>
                  </>
                ) : <button onClick={() => setBrandsEdit(true)} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px]">✏️ Edit brands</button>}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {brands.map((b, i) => (
                <div key={b.key} className="bg-surface border border-line rounded-cardLg p-5">
                  <div className="flex items-center gap-3 mb-3">
                    {brandsEdit
                      ? <input type="color" value={b.color} onChange={(e) => editBrand(i, { color: e.target.value })} className="w-9 h-9 rounded-[10px] border border-line2 bg-transparent cursor-pointer" />
                      : <span className="w-9 h-9 rounded-[10px]" style={{ background: b.color }} />}
                    <div className="flex-1">
                      {brandsEdit ? (
                        <>
                          <input value={b.name} onChange={(e) => editBrand(i, { name: e.target.value })} className="w-full text-[14.5px] font-bold px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none mb-1" />
                          <input value={b.lead} placeholder="Lead" onChange={(e) => editBrand(i, { lead: e.target.value })} className="w-full text-[11.5px] text-faint px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                        </>
                      ) : <><div className="text-[14.5px] font-bold">{b.name}</div><div className="text-[11.5px] text-faint">Lead · {b.lead || "—"}</div></>}
                    </div>
                    {brandsEdit && <button onClick={() => { setBrands((bs) => bs.filter((_, j) => j !== i)); setBrandsDirty(true); }} className="text-[13px] text-status-red font-bold">✕</button>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-ivory border border-line3 rounded-card p-2 text-center"><div className="text-[14px] font-extrabold">{b.branchList.length}</div><div className="text-[9.5px] text-faint font-bold uppercase">Branches</div></div>
                    <div className="bg-ivory border border-line3 rounded-card p-2 text-center"><div className="text-[14px] font-extrabold">{b.campaigns}</div><div className="text-[9.5px] text-faint font-bold uppercase">Campaigns</div></div>
                    <div className="bg-ivory border border-line3 rounded-card p-2 text-center">
                      {brandsEdit
                        ? <input value={b.budget} onChange={(e) => editBrand(i, { budget: e.target.value })} className="w-full text-[13px] font-extrabold text-center px-1 py-[2px] rounded-[6px] border border-line2 bg-white outline-none" />
                        : <div className="text-[14px] font-extrabold">{b.budget}</div>}
                      <div className="text-[9.5px] text-faint font-bold uppercase">Budget</div>
                    </div>
                  </div>
                  <BranchEditor branches={b.branchList} editable={brandsEdit} onChange={(branchList) => editBrand(i, { branchList })} />
                </div>
              ))}
            </div>
          </div>
        )}

        {section === "teams" && (
          <div className="flex flex-col gap-3">
            {canEdit && (
              <div className="flex items-center justify-end gap-2">
                {teamsEdit ? (
                  <>
                    <button onClick={() => { setTeams(TEAMS_DATA.map((t) => ({ ...t, members: [...t.members] }))); setTeamsEdit(false); setTeamsDirty(false); fetchJsonSetting<TeamCfg[]>("teams_config").then((t) => { if (t?.length) setTeams(t); }); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">Cancel</button>
                    <button onClick={() => { setTeams((ts) => [...ts, { icon: "👥", name: "New team", lead: "", scope: "", members: [] }]); setTeamsDirty(true); }} className="text-[12px] font-bold text-accent border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">+ Add team</button>
                    <button onClick={persistTeams} disabled={!teamsDirty} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px] disabled:opacity-40">Save changes</button>
                  </>
                ) : <button onClick={() => setTeamsEdit(true)} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px]">✏️ Edit teams</button>}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {teams.map((t, i) => (
                <div key={i} className="bg-surface border border-line rounded-cardLg p-5">
                  <div className="flex items-center gap-2 mb-2">
                    {teamsEdit
                      ? <input value={t.icon} onChange={(e) => editTeam(i, { icon: e.target.value })} className="w-9 text-[18px] text-center px-1 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                      : <span className="text-[18px]">{t.icon}</span>}
                    {teamsEdit
                      ? <input value={t.name} onChange={(e) => editTeam(i, { name: e.target.value })} className="flex-1 text-[14.5px] font-bold px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                      : <div className="text-[14.5px] font-bold flex-1">{t.name}</div>}
                    {teamsEdit
                      ? <input value={t.lead} placeholder="Lead" onChange={(e) => editTeam(i, { lead: e.target.value })} className="w-[110px] text-[11.5px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                      : <span className="text-[11.5px] text-faint">Lead · {t.lead || "—"}</span>}
                    {teamsEdit && <button onClick={() => { setTeams((ts) => ts.filter((_, j) => j !== i)); setTeamsDirty(true); }} className="text-[13px] text-status-red font-bold">✕</button>}
                  </div>
                  {teamsEdit
                    ? <input value={t.scope} placeholder="Scope / responsibilities" onChange={(e) => editTeam(i, { scope: e.target.value })} className="w-full text-[12px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none mb-3" />
                    : <div className="text-[12px] text-muted mb-3">{t.scope}</div>}
                  <BranchEditor branches={t.members} editable={teamsEdit} placeholder="member" onChange={(members) => editTeam(i, { members })} />
                </div>
              ))}
            </div>
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
                <div key={u.email} className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1fr_1.2fr_0.8fr_auto] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0">
                  <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: u.color }}>{initials(u.name)}</span><div><div className="text-[13.5px] font-bold">{u.name}</div><div className="text-[11px] text-faint">{u.email}</div></div></div>
                  <div className="text-[12.5px] text-muted">{u.role}</div>
                  <div><Pill text={u.access} fg={acc.fg} bg={acc.bg} /></div>
                  <div className="text-[12px] text-muted">{u.brandAccess}</div>
                  <div><Pill text={u.status} fg={invited ? "#C68A1E" : "#4E7A4E"} bg={invited ? "#FBF8EE" : "#EEF4EE"} /></div>
                  {canEdit && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setEditUser({ orig: u.email, m: { ...u } })} className="text-[11.5px] font-bold text-accent">Edit</button>
                      <button onClick={() => { if (confirm(`ลบ ${u.name} ออกจากทีม?`)) { setUsers((us) => us.filter((x) => x.email !== u.email)); deleteMember(u.email); } }} className="text-[11.5px] font-bold text-status-red">Delete</button>
                    </div>
                  )}
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
            {/* Edit toolbar — CMO only */}
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
                {apprEdit && <button onClick={() => { setThresholds((ts) => [...ts, { range: "฿ new tier", approver: "", chain: ["Marketing Manager / BGL"] }]); setApprDirty(true); }} className="text-[11.5px] font-bold text-accent">+ Add tier</button>}
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
                          <select value={r.backup} onChange={(e) => { setRules((rs) => rs.map((x, i) => i === ri ? { ...x, backup: e.target.value } : x)); setApprDirty(true); }} className="text-[11.5px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none">
                            <option value="">— none —</option>
                            {[...new Set([r.backup, ...users.map((u) => u.name)])].filter(Boolean).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select></label>
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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(WF_MODULE_LABELS) as WfModule[]).map((m) => {
                  const active = m === wfModule;
                  return <button key={m} onClick={() => setWfModule(m)} className="text-[12px] px-[14px] py-[6px] rounded-pill" style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>{WF_MODULE_LABELS[m]}</button>;
                })}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  {wfEdit ? (
                    <>
                      <button onClick={() => { setStatusSets(Object.fromEntries((Object.keys(STATUS_SETS) as WfModule[]).map((m) => [m, STATUS_SETS[m].map((s) => ({ ...s }))])) as Record<WfModule, WfStatus[]>); setWfEdit(false); setWfDirty(false); fetchJsonSetting<Record<WfModule, WfStatus[]>>("workflow_status").then((w) => { if (w) setStatusSets((cur) => ({ ...cur, ...w })); }); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">Cancel</button>
                      <button onClick={persistWorkflow} disabled={!wfDirty} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px] disabled:opacity-40">Save changes</button>
                    </>
                  ) : <button onClick={() => setWfEdit(true)} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px]">✏️ Edit statuses</button>}
                </div>
              )}
            </div>
            <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
              {statusSets[wfModule].map((s, si) => {
                const tone = s.type === "Done" ? ["#4E7A4E", "#EEF4EE"] : s.type === "Waiting" ? ["#C68A1E", "#FBF8EE"] : s.type === "Cancelled" ? ["#B33A2E", "#FFF5F4"] : ["#3E5C9A", "#EEF1F8"];
                const list = statusSets[wfModule];
                const move = (dir: number) => { const j = si + dir; if (j < 0 || j >= list.length) return; const next = [...list]; [next[si], next[j]] = [next[j], next[si]]; editStatuses(wfModule, next); };
                return (
                  <div key={si} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
                    <span className="text-[11px] font-bold text-faint w-5">{s.order}</span>
                    {wfEdit
                      ? <input type="color" value={s.color} onChange={(e) => editStatuses(wfModule, list.map((x, j) => j === si ? { ...x, color: e.target.value } : x))} className="w-6 h-6 rounded-full border border-line2 bg-transparent cursor-pointer p-0" />
                      : <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />}
                    {wfEdit
                      ? <input value={s.name} onChange={(e) => editStatuses(wfModule, list.map((x, j) => j === si ? { ...x, name: e.target.value } : x))} className="flex-1 text-[13.5px] font-semibold px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                      : <span className="text-[13.5px] font-semibold flex-1">{s.name}</span>}
                    {wfEdit ? (
                      <select value={s.type} onChange={(e) => editStatuses(wfModule, list.map((x, j) => j === si ? { ...x, type: e.target.value } : x))} className="text-[11.5px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none">
                        {["Active", "Waiting", "Done", "Cancelled"].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    ) : <Pill text={s.type} fg={tone[0]} bg={tone[1]} />}
                    {wfEdit && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => move(-1)} disabled={si === 0} className="text-[12px] text-faint disabled:opacity-30">↑</button>
                        <button onClick={() => move(1)} disabled={si === list.length - 1} className="text-[12px] text-faint disabled:opacity-30">↓</button>
                        <button onClick={() => editStatuses(wfModule, list.filter((_, j) => j !== si))} className="text-[12px] text-status-red font-bold ml-1">✕</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {wfEdit && (
                <button onClick={() => editStatuses(wfModule, [...statusSets[wfModule], { order: statusSets[wfModule].length + 1, name: "New status", color: "#9A9387", type: "Active" }])} className="w-full text-[12px] font-bold text-accent py-3 hover:bg-ivory/50">+ Add status</button>
              )}
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
          <div className="flex flex-col gap-3">
            {canEdit && (
              <div className="flex items-center justify-end gap-2">
                {tplEdit ? (
                  <>
                    <button onClick={() => { setTemplates(TEMPLATES.map((t) => ({ ...t }))); setTplEdit(false); setTplDirty(false); fetchJsonSetting<TemplateCfg[]>("templates_config").then((t) => { if (t?.length) setTemplates(t); }); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">Cancel</button>
                    <button onClick={() => { setTemplates((ts) => [...ts, { name: "New template", desc: "", module: "Campaign", updated: todayLabel(), status: "Draft" }]); setTplDirty(true); }} className="text-[12px] font-bold text-accent border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">+ Add template</button>
                    <button onClick={persistTemplates} disabled={!tplDirty} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px] disabled:opacity-40">Save changes</button>
                  </>
                ) : <button onClick={() => setTplEdit(true)} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px]">✏️ Edit templates</button>}
              </div>
            )}
            <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
              {templates.map((t, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_0.8fr_auto] gap-y-1 gap-x-3 items-center px-5 py-3 border-b border-line4 last:border-0">
                  {tplEdit ? (
                    <div>
                      <input value={t.name} onChange={(e) => editTpl(i, { name: e.target.value })} className="w-full text-[13.5px] font-bold px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none mb-1" />
                      <input value={t.desc} placeholder="description" onChange={(e) => editTpl(i, { desc: e.target.value })} className="w-full text-[11.5px] text-faint px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none" />
                    </div>
                  ) : <div><div className="text-[13.5px] font-bold">{t.name}</div><div className="text-[11.5px] text-faint">{t.desc}</div></div>}
                  <div>{tplEdit
                    ? <select value={t.module} onChange={(e) => editTpl(i, { module: e.target.value })} className="text-[12px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none">{["Campaign", "Graphic", "KOL", "Content", "CRM", "Settings"].map((m) => <option key={m}>{m}</option>)}</select>
                    : typePill(t.module)}</div>
                  <div className="text-[12px] text-faint">Updated {t.updated}</div>
                  <div>{tplEdit
                    ? <select value={t.status} onChange={(e) => editTpl(i, { status: e.target.value })} className="text-[12px] px-2 py-1 rounded-[7px] border border-line2 bg-ivory outline-none"><option>Active</option><option>Draft</option></select>
                    : <Pill text={t.status} fg={t.status === "Active" ? "#4E7A4E" : "#C68A1E"} bg={t.status === "Active" ? "#EEF4EE" : "#FBF8EE"} />}</div>
                  {tplEdit && <button onClick={() => { setTemplates((ts) => ts.filter((_, j) => j !== i)); setTplDirty(true); }} className="text-[12px] text-status-red font-bold justify-self-end">✕</button>}
                </div>
              ))}
            </div>
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
                  <BrandScopeEditor value={inv.brandAccess} onChange={(brandAccess) => setInv({ ...inv, brandAccess })} />
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

      {/* Edit member modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditUser(null)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="text-[16px] font-extrabold">Edit member</div>
              <button onClick={() => setEditUser(null)} className="text-[18px] text-faint leading-none -mt-1">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Full name</label>
                <input value={editUser.m.name} onChange={(e) => setEditUser((u) => u && { ...u, m: { ...u.m, name: e.target.value } })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Email</label>
                <input value={editUser.m.email} onChange={(e) => setEditUser((u) => u && { ...u, m: { ...u.m, email: e.target.value } })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Role / position</label>
                <select value={editUser.m.role} onChange={(e) => setEditUser((u) => u && { ...u, m: { ...u.m, role: e.target.value } })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                  {ROLE_OPTIONS.map((o) => <option key={o.role} value={o.role}>{o.role}{o.external ? " · external" : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Access level</label>
                  <select value={editUser.m.access} onChange={(e) => setEditUser((u) => u && { ...u, m: { ...u.m, access: e.target.value } })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                    <option>Admin</option><option>Editor</option><option>Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Status</label>
                  <select value={editUser.m.status} onChange={(e) => setEditUser((u) => u && { ...u, m: { ...u.m, status: e.target.value } })} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                    <option>Active</option><option>Invited</option><option>Suspended</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand / branch scope</label>
                <BrandScopeEditor value={editUser.m.brandAccess} onChange={(brandAccess) => setEditUser((u) => u && { ...u, m: { ...u.m, brandAccess } })} />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { if (!editUser) return; const { orig, m } = editUser; setUsers((us) => us.map((x) => x.email === orig ? m : x)); updateMember(m, orig); setEditUser(null); }} disabled={!editUser.m.name.trim() || !editUser.m.email.trim()}
                className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Save changes</button>
              <button onClick={() => setEditUser(null)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
