"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchMembers, Member } from "@/lib/db/settings";
import type { Role } from "@/lib/role";

/** Auth is only enforced when this flag is set AND Supabase is configured. */
export const AUTH_REQUIRED = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" && isSupabaseConfigured;

interface AuthCtx {
  user: User | null;
  member: Member | null;
  role: Role;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Map a member record to an app Role for UI gating. */
function memberRole(m: Member | null): Role {
  // A signed-in user with no members row gets the least-privileged role — never
  // admin. (The demo/no-auth default is handled separately in the provider.)
  if (!m) return "Content Creator";
  if (m.brandAccess === "External only" || /agency/i.test(m.role)) return "Agency (External)";
  if (m.access === "Admin" || /cmo|admin/i.test(m.role)) return "CMO";
  if (/marketing manager|brand lead|bgl/i.test(m.role)) return "Marketing Manager / BGL";
  if (/kol/i.test(m.role)) return "KOL Specialist";
  if (/creative leader/i.test(m.role)) return "Creative Leader";
  if (/vdo|video/i.test(m.role)) return "VDO Editor";
  if (/design|graphic/i.test(m.role)) return "Senior Graphic Designer";
  if (/co-?ordinator/i.test(m.role)) return "Co-ordinator";
  if (/content creator|copywriter|content/i.test(m.role)) return "Content Creator";
  if (/marketing executive|planner|campaign/i.test(m.role)) return "Marketing Executive";
  return "Marketing Executive";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(AUTH_REQUIRED);

  useEffect(() => {
    const db = supabase();
    if (!AUTH_REQUIRED || !db) { setLoading(false); return; }
    let alive = true;

    const resolveMember = async (u: User | null) => {
      if (!u?.email) { setMember(null); return; }
      try {
        const all = await fetchMembers();
        const m = all.find((x) => x.email.toLowerCase() === u.email!.toLowerCase()) ?? null;
        if (alive) setMember(m);
      } catch { /* ignore */ }
    };

    db.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      await resolveMember(data.session?.user ?? null);
      if (alive) setLoading(false);
    });

    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      resolveMember(session?.user ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase()?.auth.signOut(); };

  // Auth off / demo → full access. Signed in → role from their members row.
  const role: Role = !AUTH_REQUIRED || !user ? "CMO" : memberRole(member);

  return (
    <Ctx.Provider value={{ user, member, role, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) return { user: null, member: null, role: "CMO", loading: false, signOut: async () => {} };
  return ctx;
}
