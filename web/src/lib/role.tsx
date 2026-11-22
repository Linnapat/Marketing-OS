"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { canViewAsOtherRole } from "@/lib/roleGates";
import { fetchPermissions } from "@/lib/db/settings";
import { canSeeModule, hasModuleLevel, type PermMatrix } from "@/lib/permissions";

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
  /** The signed-in person's own role — what the database goes by. */
  authRole: Role;
  /** True while the screen is drawn as some OTHER role (a CMO previewing). */
  viewingAs: boolean;
  /** May this person switch "Viewing as" at all? */
  canViewAs: boolean;
  /** Can the current role see a module? Driven by the Settings Permissions matrix. */
  can: (module: string) => boolean;
  /** Does the role reach a level on a module? Gate WRITES on this, not on
   *  `can` — six of the ten roles sit at View on Content, and treating "may
   *  look at it" as "may change it" is how Trash ended up offering them a
   *  permanent-delete button. Mirrors the database's has_module(). */
  atLeast: (module: string, min: "View" | "Edit" | "Approve" | "Admin") => boolean;
}

const RoleContext = createContext<RoleCtx | null>(null);

/** App-wide "viewing as" role. Drives role-based visibility across modules
 *  (the sidebar RoleSwitcher writes here; feature gates read from here). */
export function RoleProvider({ children }: { children: ReactNode }) {
  const { role: authRole, user } = useAuth();
  const [role, setRoleState] = useState<Role>(authRole);
  const canViewAs = canViewAsOtherRole(authRole, AUTH_REQUIRED);
  // The gate is here, not only on the button: hiding the switcher from a role
  // that may not use it is not the same as refusing the switch.
  const setRole = (r: Role) => { if (canViewAs || r === authRole) setRoleState(r); };
  // Permission matrix: bundled defaults first (null), overlaid with the saved
  // matrix from Settings when it loads — so gating reflects admin edits.
  const [matrix, setMatrix] = useState<PermMatrix | null>(null);
  // When the signed-in user resolves, default the "viewing as" role to theirs.
  useEffect(() => { setRoleState(authRole); }, [authRole]);
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
  const atLeast = (module: string, min: "View" | "Edit" | "Approve" | "Admin") => hasModuleLevel(matrix, role, module, min);
  return <RoleContext.Provider value={{ role, setRole, can, atLeast, authRole, viewingAs: role !== authRole, canViewAs }}>{children}</RoleContext.Provider>;
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
