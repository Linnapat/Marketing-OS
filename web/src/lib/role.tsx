"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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
}

const RoleContext = createContext<RoleCtx | null>(null);

/** App-wide "viewing as" role. Drives role-based visibility across modules
 *  (the sidebar RoleSwitcher writes here; feature gates read from here). */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("CMO / Admin");
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
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
