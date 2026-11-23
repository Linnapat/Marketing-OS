"use client";

import { toast } from "@/lib/toast";
import { canViewAsOtherRole, effectiveRole } from "@/lib/roleGates";
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
  /** The role the app is being drawn for. The signed-in person's own role —
   *  unless they are the CMO previewing another one, in which case it is the
   *  previewed role (see previewRole). Every gate in the app reads this, which
   *  is the point: a preview that only some pages honoured showed the CMO a
   *  designer's Content Plan next to a CMO's Graphic Request. */
  role: Role;
  /** Who is actually signed in. The database goes by this, always. Use it for
   *  anything that must not follow a preview: routing a real agency account to
   *  its portal, deciding who may preview at all. */
  realRole: Role;
  /** True while the screen is drawn as another role. */
  previewing: boolean;
  /** May this person preview other roles? */
  canPreview: boolean;
  /** Draw the app as `r`; null (or their own role) goes back. Ignored for
   *  anyone who may not preview. */
  setPreviewRole: (r: Role | null) => void;
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

const PREVIEW_FLAG = "mos-role-preview";

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
  const realRole: Role = !AUTH_REQUIRED ? "CMO" : user ? memberRole(member) : "Content Creator";

  // ── Role preview ("Viewing as") ─────────────────────────────────────────
  // Lives here, at the source every gate reads, rather than in the sidebar's
  // own context: about a dozen pages take their role from useAuth() and never
  // saw the switcher, so the CMO previewing a Content Creator still got the
  // CMO's Graphic Request, Approval Center and campaign pages.
  //
  // What it is: this browser draws the buttons that role would see, and the
  // ones the CMO presses really do save — that is what lets them work a screen
  // the way that role would. What it is not: a change of identity. Supabase
  // still has the CMO's session, so the database applies the CMO's rights and
  // every write carries the CMO's name. Held in memory only — a reload, or a
  // different account signing in, is back to the real role.
  const [previewRole, setPreviewState] = useState<Role | null>(null);
  const canPreview = canViewAsOtherRole(realRole, AUTH_REQUIRED);
  useEffect(() => { setPreviewState(null); }, [realRole, user?.id]);
  const setPreviewRole = (r: Role | null) => {
    if (!canPreview) return;
    const next = r && r !== realRole ? r : null;
    setPreviewState(next);
    // Remembered only so a reload can SAY the preview ended — it is never
    // restored from here.
    try { if (next) sessionStorage.setItem(PREVIEW_FLAG, next); else sessionStorage.removeItem(PREVIEW_FLAG); } catch { /* no-op */ }
  };
  // A reload drops the preview on purpose. Without a word about it the screen
  // simply changed back, which read as the preview having broken.
  useEffect(() => {
    try {
      const was = sessionStorage.getItem(PREVIEW_FLAG);
      if (!was) return;
      sessionStorage.removeItem(PREVIEW_FLAG);
      toast(`รีเฟรชหน้าแล้ว — ออกจากมุมมอง ${was} กลับเป็นสิทธิ์ของคุณเอง`);
    } catch { /* no-op */ }
  }, []);
  const role: Role = effectiveRole(realRole, previewRole, AUTH_REQUIRED);
  const previewing = role !== realRole;

  return (
    <Ctx.Provider value={{ user, member, role, realRole, previewing, canPreview, setPreviewRole, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  // Called outside AuthProvider (misuse/bug) — fail safe with the
  // least-privileged role rather than handing out CMO access.
  if (!ctx) return { user: null, member: null, role: "Content Creator", realRole: "Content Creator", previewing: false, canPreview: false, setPreviewRole: () => {}, loading: false, signOut: async () => {} };
  return ctx;
}
