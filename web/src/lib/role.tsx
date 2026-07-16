"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { fetchPermissions } from "@/lib/db/settings";
import { canSeeModule, type PermMatrix } from "@/lib/permissions";

export const ROLES = [
  "CMO",
  "Marketing Manager / BGL",
  "Creative Leader",
  "Marketing Executive",
  "Senior Graphic Designer",
  "VDO Editor",
  "Co-ordinator",
  "KOL Specialist",
  "Content Creator",
  "Agency (External)",
] as const;
export type Role = (typeof ROLES)[number];

interface RoleCtx {
  role: Role;
  setRole: (r: Role) => void;
  /** Can the current role see a module? Driven by the Settings Permissions matrix. */
  can: (module: string) => boolean;
}

const RoleContext = createContext<RoleCtx | null>(null);

/** App-wide "viewing as" role. Drives role-based visibility across modules
 *  (the sidebar RoleSwitcher writes here; feature gates read from here). */
export function RoleProvider({ children }: { children: ReactNode }) {
  const { role: authRole, user } = useAuth();
  const [role, setRole] = useState<Role>(authRole);
  // Permission matrix: bundled defaults first (null), overlaid with the saved
  // matrix from Settings when it loads — so gating reflects admin edits.
  const [matrix, setMatrix] = useState<PermMatrix | null>(null);
  // When the signed-in user resolves, default the "viewing as" role to theirs.
  useEffect(() => { setRole(authRole); }, [authRole]);
  // Re-fetch whenever the signed-in user changes. A matrix read while logged out
  // or locked out comes back empty under RLS; without this it was cached past
  // login (fetched once on mount), so after a client-side login the nav kept
  // gating against stale/empty permissions (e.g. Settings vanished for a CMO).
  // An empty result is ignored so we fall back to the bundled defaults rather
  // than caching "no permissions".
  useEffect(() => {
    let alive = true;
    fetchPermissions()
      .then((m) => { if (alive && m && Object.keys(m).length > 0) setMatrix(m); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);
  const can = (module: string) => canSeeModule(matrix, role, module);
  return <RoleContext.Provider value={{ role, setRole, can }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}

/** Operation-level financials (salary, bonus, incentives, SSO…) are sensitive —
 *  only the CMO may view them in the P&L. */
export function canSeeOperation(role: Role): boolean {
  return role === "CMO";
}
