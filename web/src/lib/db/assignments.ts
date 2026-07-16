// Resolve a KOL's Owner and Approver from real configuration — never a demo
// fallback (no "Ken S." / "Aran P."). Owner comes from the KOL team roster in
// Settings › Teams; Approver comes from the module's approval chain in Settings
// › Approval Matrix, mapping the first chain role to a real member.
// When nothing resolves, returns "Unassigned" so callers can raise Needs Attention.

import { fetchMembers, fetchJsonSetting, Member } from "./settings";
import { fetchApprovalMatrix, ModuleRule } from "./settings";
import { TEAMS_DATA, APPROVAL_RULES } from "@/lib/data/settings";

export const UNASSIGNED = "Unassigned";

type TeamCfg = { icon: string; name: string; lead: string; scope: string; members: string[] };

/** The KOL team's members from Settings › Teams (shared config, else defaults). */
async function kolTeam(): Promise<TeamCfg | null> {
  const teams = (await fetchJsonSetting<TeamCfg[]>("teams_config")) ?? (TEAMS_DATA as TeamCfg[]);
  return teams.find((t) => /kol|creator/i.test(t.name)) ?? null;
}

function activeMemberForToken(token: string, members: Member[]): Member | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  return members
    .filter((m) => (m.status || "").toLowerCase() === "active")
    .find((m) => m.email.toLowerCase() === t || m.name.toLowerCase() === t) ?? null;
}

/** Owner for a new KOL: the KOL team lead, else its first member, else Unassigned. */
export async function resolveKolOwner(): Promise<string> {
  const [team, members] = await Promise.all([kolTeam(), fetchMembers()]);
  if (!team) return UNASSIGNED;
  const lead = activeMemberForToken(team.lead || "", members);
  if (lead) return lead.name;
  for (const token of team.members ?? []) {
    const member = activeMemberForToken(token, members);
    if (member) return member.name;
  }
  return UNASSIGNED;
}

/** Match an approval-chain role label (e.g. "CMO", "Marketing Manager / BGL") to a
 *  real active member whose role contains it. */
function memberForRole(role: string, members: Member[]): string | null {
  const r = role.trim().toLowerCase();
  const active = members.filter((m) => (m.status || "").toLowerCase() === "active");
  const hit = active.find((m) => (m.role || "").toLowerCase().includes(r))
    ?? active.find((m) => r.includes((m.role || "").toLowerCase().split(" ")[0]));
  return hit?.name ?? null;
}

/** Approver for a module: the first resolvable person in that module's approval
 *  chain (Settings › Approval Matrix). Unassigned when none of the roles map. */
export async function resolveApprover(moduleName: string): Promise<string> {
  const matrix = await fetchApprovalMatrix();
  const rules: ModuleRule[] = matrix?.rules?.length ? matrix.rules : (APPROVAL_RULES as ModuleRule[]);
  const rule = rules.find((r) => new RegExp(r.module.replace(/[/\s]+/g, ".*"), "i").test(moduleName))
    ?? rules.find((r) => moduleName.toLowerCase().includes(r.module.toLowerCase().split(" ")[0]));
  if (!rule) return UNASSIGNED;
  const members = await fetchMembers();
  for (const role of rule.chain) {
    const person = memberForRole(role, members);
    if (person) return person;
  }
  return UNASSIGNED;
}

/** Resolve both at once for KOL creation. */
export async function resolveKolAssignment(): Promise<{ owner: string; approver: string }> {
  const [owner, approver] = await Promise.all([resolveKolOwner(), resolveApprover("KOL / Creator")]);
  return { owner, approver };
}
