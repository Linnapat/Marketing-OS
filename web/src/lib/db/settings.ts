// Data access for Settings → Users & Roles (the members table).

import { supabase } from "@/lib/supabase";
import { USERS_DATA } from "@/lib/data/settings";

export interface Member {
  name: string; email: string; role: string; access: string;
  brandAccess: string; status: string; color: string;
}
type Row = {
  email: string; name: string; role: string; access: string;
  brand_access: string; status: string; color: string;
};

const toMember = (r: Row): Member => ({
  name: r.name, email: r.email, role: r.role, access: r.access,
  brandAccess: r.brand_access, status: r.status, color: r.color,
});

export async function fetchMembers(): Promise<Member[]> {
  const db = supabase();
  if (!db) return USERS_DATA.map((u) => ({ ...u }));
  const { data, error } = await db.from("members").select("*").order("email");
  if (error || !data) return USERS_DATA.map((u) => ({ ...u }));
  return (data as Row[]).map(toMember);
}

export async function createMember(m: Member): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("members").upsert({
    email: m.email, name: m.name, role: m.role, access: m.access,
    brand_access: m.brandAccess, status: m.status, color: m.color,
  });
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
  await db.from("permissions").upsert(rows.map((r) => ({ role: r.role, descr: r.descr, perms: r.perms })));
}

/* ── Organization fields ────────────────────────────────────────────── */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function fetchOrg(): Promise<{ label: string; value: string }[] | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("org_settings").select("label, value").order("key");
  if (error || !data) return null;
  return data.map((r) => ({ label: r.label as string, value: r.value as string }));
}

export async function saveOrg(fields: { label: string; value: string }[]): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("org_settings").upsert(fields.map((f) => ({ key: slug(f.label), label: f.label, value: f.value })));
}
