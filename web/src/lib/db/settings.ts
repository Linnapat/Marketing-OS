// Data access for Settings → Users & Roles (the members table).

import { supabase } from "@/lib/supabase";
import { BRANDS_DATA, BrandCfg, ORG_FIELDS, USERS_DATA } from "@/lib/data/settings";
import { CAMPAIGN_TYPES } from "@/lib/data/brief";
import { assertDbOk } from "@/lib/db/assert";
import { logAudit } from "@/lib/db/audit";

export interface Member {
  name: string; email: string; role: string; access: string;
  brandAccess: string; status: string; color: string;
  avatarUrl?: string;
  presence?: string;
  statusNote?: string;
}
type Row = {
  email: string; name: string; role: string; access: string;
  brand_access: string; status: string; color: string;
};

const toMember = (r: Row): Member => ({
  name: r.name, email: r.email, role: r.role, access: r.access,
  brandAccess: r.brand_access, status: r.status, color: r.color,
});

export interface MemberProfile {
  avatarUrl?: string;
  presence?: string;
  statusNote?: string;
}

type MemberProfileMap = Record<string, MemberProfile>;

function withProfiles(members: Member[], profiles: MemberProfileMap | null): Member[] {
  if (!profiles) return members;
  return members.map((m) => ({ ...m, ...(profiles[m.email.toLowerCase()] ?? {}) }));
}

export async function fetchMembers(): Promise<Member[]> {
  const db = supabase();
  if (!db) return USERS_DATA.map((u) => ({ ...u }));
  const profiles = await fetchMemberProfiles().catch(() => null);
  const { data, error } = await db.from("members").select("*").order("email");
  if (error || !data) return []; // query error = no live data, never demo rows
  return withProfiles((data as Row[]).map(toMember), profiles);
}

/** Live sync: any member write announces itself so AuthProvider (sidebar
 *  name/role) refreshes without a full page reload. */
function announceMembersUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("members-updated"));
}

export async function createMember(m: Member): Promise<void> {
  const db = supabase();
  if (!db) return;
  // Explicit INSERT (not upsert) so it maps to the admin-only INSERT policy on
  // members — upsert would also be checked against that policy on every write,
  // breaking a staff member's own-profile update. See supabase/security_p5.sql.
  const { error } = await db.from("members").insert({
    email: m.email, name: m.name, role: m.role, access: m.access,
    brand_access: m.brandAccess, status: m.status, color: m.color,
  });
  assertDbOk(error, "Could not save member");
  logAudit(`บันทึกสมาชิก ${m.name}`, "Settings", { after: `${m.role} · ${m.access} · ${m.status}`, meta: { email: m.email } });
  announceMembersUpdated();
}

/** Edit an existing member. Email is the PK, so pass origEmail when the email
 *  itself changed (delete the old row, insert the new). */
export async function updateMember(m: Member, origEmail?: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  if (origEmail && origEmail !== m.email) {
    // Email is the PK — replace the row (admin-only path).
    const { error } = await db.from("members").delete().eq("email", origEmail);
    assertDbOk(error, "Could not replace member email");
    await createMember(m);
    return;
  }
  // Pure UPDATE (not upsert) so it works under the members RLS: an admin may
  // update anyone; a staff member may update only their own row, and a trigger
  // freezes role/access/brand/status for non-admins (see supabase/security_p5.sql).
  const { error } = await db.from("members").update({
    name: m.name, role: m.role, access: m.access,
    brand_access: m.brandAccess, status: m.status, color: m.color,
  }).eq("email", m.email);
  assertDbOk(error, "Could not update member");
  logAudit(`บันทึกสมาชิก ${m.name}`, "Settings", { after: `${m.role} · ${m.access} · ${m.status}`, meta: { email: m.email } });
  announceMembersUpdated();
}

export async function deleteMember(email: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("members").delete().eq("email", email);
  assertDbOk(error, "Could not delete member");
  logAudit(`ลบสมาชิก ${email}`, "Settings", { before: email, after: "ลบแล้ว" });
  announceMembersUpdated();
}

export async function fetchMemberProfiles(): Promise<MemberProfileMap | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("org_settings").select("value").eq("key", "member_profiles_v1").maybeSingle();
  if (error || !data?.value) return null;
  try { return JSON.parse(data.value as string) as MemberProfileMap; } catch { return null; }
}

export async function saveMemberProfile(email: string, profile: MemberProfile): Promise<void> {
  const db = supabase();
  if (!db) return;
  const current = (await fetchMemberProfiles()) ?? {};
  const next: MemberProfileMap = {
    ...current,
    [email.toLowerCase()]: {
      avatarUrl: profile.avatarUrl?.trim() || undefined,
      presence: profile.presence?.trim() || undefined,
      statusNote: profile.statusNote?.trim() || undefined,
    },
  };
  const { error } = await db.from("org_settings").upsert({
    key: "member_profiles_v1",
    label: "Member profile display settings",
    value: JSON.stringify(next),
  });
  assertDbOk(error, "Could not save member profile");
  announceMembersUpdated();
}

/* ── Generic team-shared JSON settings (org_settings kv) ─────────────── */
// Used by Brands, Teams, and Workflow Status editors. Each is one JSON blob.
export async function fetchJsonSetting<T>(key: string): Promise<T | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("org_settings").select("value").eq("key", key).maybeSingle();
  if (error || !data?.value) return null;
  try { return JSON.parse(data.value as string) as T; } catch { return null; }
}

export async function saveJsonSetting<T>(key: string, label: string, value: T): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("org_settings").upsert({ key, label, value: JSON.stringify(value) });
  assertDbOk(error, `Could not save ${label}`);
}

export async function fetchBrandConfigs(): Promise<BrandCfg[]> {
  const saved = await fetchJsonSetting<BrandCfg[]>("brands_config").catch(() => null);
  if (saved?.length) {
    return saved.map((b) => ({ ...b, branchList: [...(b.branchList ?? [])] }));
  }
  return BRANDS_DATA.map((b) => ({ ...b, branchList: [...b.branchList] }));
}

export async function fetchCampaignTypeConfigs(): Promise<string[]> {
  const saved = await fetchJsonSetting<string[]>("campaign_types_config").catch(() => null);
  return saved !== null ? saved : [...CAMPAIGN_TYPES];
}

/* ── Permissions matrix ─────────────────────────────────────────────── */
export interface PermRow { role: string; descr: string; perms: { module: string; level: string }[] }

export async function fetchPermissions(): Promise<Record<string, Record<string, string>> | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("permissions").select("role, perms");
  if (error || !data) return null;
  const map: Record<string, Record<string, string>> = {};
  data.forEach((r) => {
    const inner: Record<string, string> = {};
    ((r.perms as { module: string; level: string }[]) ?? []).forEach((p) => { inner[p.module] = p.level; });
    map[r.role as string] = inner;
  });
  return map;
}

export async function savePermissions(rows: PermRow[]): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("permissions").upsert(rows.map((r) => ({ role: r.role, descr: r.descr, perms: r.perms })));
  assertDbOk(error, "Could not save permissions");
  logAudit("แก้ไข Permissions matrix", "Settings", { after: `${rows.length} role(s) updated` });
}

/* ── Notification toggles (channels + triggers) ─────────────────────── */
// Stored as JSON blobs in the org_settings kv table; /api/notify reads the
// same keys server-side to decide whether to send.
export interface NotifSettings { channels: Record<string, boolean>; triggers: Record<string, boolean> }

export async function fetchNotifSettings(): Promise<NotifSettings | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("org_settings").select("key, value").in("key", ["notif_channels", "notif_triggers"]);
  if (error || !data) return null;
  const get = (k: string): Record<string, boolean> | null => {
    const row = data.find((r) => r.key === k);
    if (!row) return null;
    try { return JSON.parse(row.value as string); } catch { return null; }
  };
  const channels = get("notif_channels"), triggers = get("notif_triggers");
  if (!channels && !triggers) return null;
  return { channels: channels ?? {}, triggers: triggers ?? {} };
}

export async function saveNotifSettings(s: NotifSettings): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("org_settings").upsert([
    { key: "notif_channels", label: "Notification channels", value: JSON.stringify(s.channels) },
    { key: "notif_triggers", label: "Notification triggers", value: JSON.stringify(s.triggers) },
  ]);
  assertDbOk(error, "Could not save notification settings");
}

/* ── Approval Matrix (budget thresholds + module rules) ─────────────── */
// Stored as JSON blobs in the org_settings kv table. Editable by the CMO.
export interface BudgetThreshold { range: string; approver: string; chain: string[] }
export interface ModuleRule { icon: string; module: string; sla: number; escalate: number; remind: number; backup: string; chain: string[] }
export interface ApprovalMatrix { thresholds: BudgetThreshold[]; rules: ModuleRule[] }

export async function fetchApprovalMatrix(): Promise<ApprovalMatrix | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("org_settings").select("key, value").in("key", ["approval_thresholds", "approval_rules"]);
  if (error || !data) return null;
  const get = <T,>(k: string): T | null => {
    const row = data.find((r) => r.key === k);
    if (!row) return null;
    try { return JSON.parse(row.value as string) as T; } catch { return null; }
  };
  const thresholds = get<BudgetThreshold[]>("approval_thresholds");
  const rules = get<ModuleRule[]>("approval_rules");
  if (!thresholds && !rules) return null;
  return { thresholds: thresholds ?? [], rules: rules ?? [] };
}

export async function saveApprovalMatrix(m: ApprovalMatrix): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("org_settings").upsert([
    { key: "approval_thresholds", label: "Approval budget thresholds", value: JSON.stringify(m.thresholds) },
    { key: "approval_rules", label: "Approval module rules", value: JSON.stringify(m.rules) },
  ]);
  assertDbOk(error, "Could not save approval matrix");
  logAudit("แก้ไข Approval matrix (งบ/rules)", "Settings", { after: "อัปเดต thresholds + rules" });
}

/* ── Organization fields ────────────────────────────────────────────── */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function fetchOrg(): Promise<{ label: string; value: string }[] | null> {
  const db = supabase();
  if (!db) return null;
  const wanted = ORG_FIELDS.map((f) => ({ key: slug(f.label), label: f.label, fallback: f.value }));
  const wantedKeys = wanted.map((f) => f.key);
  const { data, error } = await db.from("org_settings").select("key, label, value").in("key", wantedKeys);
  if (error || !data) return null;
  const byKey = new Map((data ?? []).map((r) => [r.key as string, { label: r.label as string, value: r.value as string }]));
  return wanted.map((f) => {
    const saved = byKey.get(f.key);
    return { label: saved?.label || f.label, value: saved?.value || f.fallback };
  });
}

export async function saveOrg(fields: { label: string; value: string }[]): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("org_settings").upsert(fields.map((f) => ({ key: slug(f.label), label: f.label, value: f.value })));
  assertDbOk(error, "Could not save organization settings");
}
