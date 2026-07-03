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
  if (error || !data || data.length === 0) return USERS_DATA.map((u) => ({ ...u }));
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
