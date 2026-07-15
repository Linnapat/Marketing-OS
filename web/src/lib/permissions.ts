// Module-level access, driven by the Settings → Permissions matrix.
// The matrix (PERM_ROLES / PERM_MODULES) is the source of truth; an admin edits
// it in Settings and it persists to Supabase. Nav + page gates read from here.

import type { Role } from "@/lib/role";
import { PERM_ROLES, PERM_MODULES } from "@/lib/data/settings";

/** Shape returned by fetchPermissions(): role → module → level label. */
export type PermMatrix = Record<string, Record<string, string>>;

/** "None" permission level label (from PERM_ROLES' N entry). */
export const PERM_NONE = "—";

/** App role vocabulary (role.tsx) → the role label used in the perm matrix. */
export const APP_ROLE_TO_PERM_ROLE: Record<Role, string> = {
  CMO: "CMO",
  "Marketing Manager / BGL": "Marketing Manager / BGL",
  "Creative Leader": "Creative Leader",
  "Marketing Executive": "Marketing Executive",
  "Senior Graphic Designer": "Senior Graphic Designer",
  "VDO Editor": "VDO Editor",
  "Co-ordinator": "Co-ordinator",
  "KOL Specialist": "KOL Specialist",
  "Content Creator": "Content Creator",
  "Agency (External)": "Agency (External)",
};

/** Default matrix built from the bundled PERM_ROLES (mock mode / pre-load). */
export function defaultMatrix(): PermMatrix {
  const m: PermMatrix = {};
  for (const r of PERM_ROLES) {
    m[r.role] = {};
    r.perms.forEach((p, i) => { m[r.role][PERM_MODULES[i]] = p.l; });
  }
  return m;
}

/** Permission level for a role+module; falls back to the bundled defaults. */
export function permLevel(matrix: PermMatrix | null, role: Role, module: string): string {
  const permRole = APP_ROLE_TO_PERM_ROLE[role] ?? role;
  const fallback = defaultMatrix();
  return matrix?.[permRole]?.[module] ?? fallback[permRole]?.[module] ?? PERM_NONE;
}

/** Whether a role may see a module at all (any level above None). */
export function canSeeModule(matrix: PermMatrix | null, role: Role, module: string): boolean {
  return permLevel(matrix, role, module) !== PERM_NONE;
}

/** Permission-matrix module guarding each route prefix. Routes not listed
 *  (Dashboard, My Tasks, Team, Work Calendar, Agency Portal) are open to every
 *  internal role; the Agency role is confined to /agency separately. */
const ROUTE_MODULE: [prefix: string, module: string][] = [
  ["/campaigns", "Campaign"],
  ["/performance", "Campaign"],
  ["/platforms", "Campaign"],
  ["/requests", "Campaign"],
  ["/approvals", "Campaign"],
  ["/ads", "Campaign"],
  ["/content", "Content"],
  ["/graphic", "Graphic"],
  ["/assets", "Graphic"],
  ["/kol", "KOL"],
  ["/finance", "Finance"],
  ["/expenses", "Finance"],
  ["/settings", "Settings"],
  ["/admin", "Settings"],
];

/** The matrix module a route belongs to, or null when the route is ungated. */
export function moduleForPath(pathname: string): string | null {
  const hit = ROUTE_MODULE.find(([p]) => pathname === p || pathname.startsWith(p + "/"));
  return hit ? hit[1] : null;
}
