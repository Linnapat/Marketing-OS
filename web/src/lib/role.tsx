"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { fetchPermissions } from "@/lib/db/settings";
import { canSeeModule, type PermMatrix } from "@/lib/permissions";

export const ROLES = [
  "CMO / Admin",
  "Brand Lead",
  "Content Planner",
  "Graphic / Creator",
  "KOL Specialist",
  "Finance",
  "CEO / Management",
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
  const { role: authRole } = useAuth();
  const [role, setRole] = useState<Role>(authRole);
  // Permission matrix: bundled defaults first (null), overlaid with the saved
  // matrix from Settings when it loads — so gating reflects admin edits.
  const [matrix, setMatrix] = useState<PermMatrix | null>(null);
  // When the signed-in user resolves, default the "viewing as" role to theirs.
  useEffect(() => { setRole(authRole); }, [authRole]);
  useEffect(() => {
    let alive = true;
    fetchPermissions().then((m) => { if (alive && m) setMatrix(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const can = (module: string) => canSeeModule(matrix, role, module);
  return <RoleContext.Provider value={{ role, setRole, can }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}

/** Operation-level financials (salary, bonus, incentives, SSO…) are sensitive —
 *  only the CMO / Admin may view them in the P&L. */
export function canSeeOperation(role: Role): boolean {
  return role === "CMO / Admin";
}
