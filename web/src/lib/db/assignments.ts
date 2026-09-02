// Resolve a KOL's Owner and Approver from real configuration — never a demo
// fallback (no "Ken S." / "Aran P."). Owner comes from the KOL team roster in
// Settings › Teams; Approver comes from the module's approval chain in Settings
// › Approval Matrix, mapping the first chain role to a real member.
// When nothing resolves, returns "Unassigned" so callers can raise Needs Attention.

import { fetchMembers, fetchJsonSetting, Member } from "./settings";
import { fetchApprovalMatrix, ModuleRule } from "./settings";
import { TEAMS_DATA, APPROVAL_RULES, BrandCfg } from "@/lib/data/settings";
import { visibleBrandsFromScope } from "@/lib/brandVisibility";
import { BrandId } from "@/lib/brands";

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
/** Who a KOL request belongs to, given the team config and the member list.
 *
 *  Team first — it names a person, and a person beats a job title. Then the
 *  ROLE, which is the half that was missing: `kolTeam()` looks for a team whose
 *  name says KOL, and the four teams actually configured are CRM,
 *  Marketing/BGL, Creative and Management. It matched none of them, so every
 *  KOL request ever raised landed on "Unassigned" while a KOL Specialist sat in
 *  the member list the whole time — and the drawer opened on "มอบหมาย Owner
 *  (KOL team)" as its next action, a job the app could have done itself.
 *
 *  Pure so the rule is testable without a database; resolveKolOwner just feeds
 *  it. */
export function pickKolOwner(
  team: { lead?: string; members?: string[] } | null,
  members: Member[],
): string {
  if (team) {
    const lead = activeMemberForToken(team.lead || "", members);
    if (lead) return lead.name;
    for (const token of team.members ?? []) {
      const member = activeMemberForToken(token, members);
      if (member) return member.name;
    }
  }
  const specialist = members.find(
    (m) => (m.status || "").toLowerCase() === "active" && /kol/i.test(m.role || ""),
  );
  return specialist?.name || UNASSIGNED;
}

export async function resolveKolOwner(): Promise<string> {
  const [team, members] = await Promise.all([kolTeam(), fetchMembers()]);
  return pickKolOwner(team, members);
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
/** Who writes captions: the Creative Leader.
 *
 *  Captions are Creative's work — the marketer asks for the post and accepts
 *  the words, Creative writes them. The fan-out used to stamp the post's writer
 *  as its own requester (`owner: ci.requester`), which made every caption look
 *  self-written: writer, requester and approver one name on 49 live posts, the
 *  self-approval rule barring that person, and nobody else offered the buttons.
 *
 *  The Leader is the landing point, not necessarily the hand that types it —
 *  they hand it on from there (canAssignCaption). "Unassigned" when Settings
 *  names no active Creative Leader, so the slot reads empty rather than being
 *  filled with a guess. */
export async function resolveCaptionWriter(): Promise<string> {
  const members = await fetchMembers().catch(() => [] as Member[]);
  const lead = members.find(
    (m) => (m.status || "").toLowerCase() === "active" && (m.role || "").trim() === "Creative Leader",
  );
  return (lead?.name || "").trim() || UNASSIGNED;
}

export async function resolveKolAssignment(): Promise<{ owner: string; approver: string }> {
  const [owner, approver] = await Promise.all([resolveKolOwner(), resolveApprover("KOL / Creator")]);
  return { owner, approver };
}

// ── Who signs off work for one brand ──────────────────────────────────────
// The graphic approval ladder and the campaign chain both used to read "the
// first member whose role matches Marketing Manager / BGL", found with a bare
// `find()` over members ordered by email. That is not brand-aware, and the
// team has no MM/BGL per brand: Omakase Don has none at all, so every OMD job
// printed the Teppen · Mainichi manager as its approver — someone whose brand
// scope will not even let them open the request.
//
// The step belongs to whoever is answerable for THAT brand, whatever their
// title: a manager scoped to the brand first, else the brand's Marketing
// Executive. Nobody scoped to it returns null, and callers drop the step
// rather than name an approver who cannot act.
const BRAND_LEAD_ROLES = [/marketing manager|bgl|brand lead/i, /marketing executive/i];

export function resolveBrandLead(brand: BrandId, members: Member[], configs?: BrandCfg[]): string | null {
  const scoped = members.filter((m) =>
    (m.status || "").toLowerCase() === "active"
    && m.brandAccess !== "External only"
    && !/agency/i.test(m.role || "")
    && visibleBrandsFromScope(m.brandAccess, configs).includes(brand));
  for (const rx of BRAND_LEAD_ROLES) {
    const hit = scoped.find((m) => rx.test(m.role || ""));
    if (hit) return hit.name;
  }
  return null;
}
