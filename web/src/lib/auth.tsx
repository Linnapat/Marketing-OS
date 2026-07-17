"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchMembers, activateInvitedMember, Member } from "@/lib/db/settings";
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
        let m = all.find((x) => x.email.toLowerCase() === u.email!.toLowerCase()) ?? null;
        // Signing in is what proves an invite was accepted, so promote it here:
        // `status` gates every owner/designer picker, and nothing else ever moved
        // it off "Invited" — new members were silently unassignable until an admin
        // edited them by hand. No-ops once Active; failures are swallowed so a
        // hiccup here can never block sign-in.
        if (m?.status === "Invited") m = (await activateInvitedMember(m.email)) ?? m;
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

  // Settings edits a member → sidebar name/role must follow without a full
  // reload. db/settings dispatches "members-updated" after every member write.
  useEffect(() => {
    if (!AUTH_REQUIRED || !user?.email) return;
    const refresh = () => {
      fetchMembers()
        .then((all) => setMember(all.find((x) => x.email.toLowerCase() === user.email!.toLowerCase()) ?? null))
        .catch(() => {});
    };
    window.addEventListener("members-updated", refresh);
    return () => window.removeEventListener("members-updated", refresh);
  }, [user]);

  const signOut = async () => { await supabase()?.auth.signOut(); };

  // Auth off / demo → full access, a deliberate config choice (AUTH_REQUIRED is
  // false). Auth required but no confirmed user yet (still loading, signed out,
  // or session resolution failed) must NEVER fall back to the highest-privilege
  // role — that would hand out CMO access to an unauthenticated caller. Fall
  // back to the least-privileged role instead; AppShell's AuthGate already
  // blocks rendering entirely in this state, but the auth layer itself should
  // not hand out admin access just because identity hasn't been confirmed.
  const role: Role = !AUTH_REQUIRED ? "CMO" : user ? memberRole(member) : "Content Creator";

  return (
    <Ctx.Provider value={{ user, member, role, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  // Called outside AuthProvider (misuse/bug) — fail safe with the
  // least-privileged role rather than handing out CMO access.
  if (!ctx) return { user: null, member: null, role: "Content Creator", loading: false, signOut: async () => {} };
  return ctx;
}
