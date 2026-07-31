// Where a notification goes. Shared by the client helper (lib/notify) and the
// API route so both agree on one set of rules.
//
// The team's own channel structure decides this, not ours:
//
//   KOL work      → #04_marketing_kol
//   VDO work      → #06_marketing_vdo      (งานตัด and งานถ่าย both)
//   Graphic work  → #05_marketing_graphic  (Content posts live here too)
//   Everything else — campaigns, tasks, asking for help — goes to the people
//   involved as a DM and to no channel at all.
//   Money never reaches a channel: it is DM'd to one person (SLACK_FINANCE_DM).
//
// So "team" is really "which audience", and only three of them are rooms.

export type NotifyTeam = "kol" | "vdo" | "graphic" | "general" | "finance";

export const NOTIFY_TEAMS: NotifyTeam[] = ["graphic", "kol", "vdo", "general", "finance"];

/** The audiences that have a Slack channel. The rest are DM-only by design. */
export const CHANNEL_TEAMS: NotifyTeam[] = ["graphic", "kol", "vdo"];

export const hasChannel = (team: NotifyTeam): boolean =>
  (CHANNEL_TEAMS as string[]).includes(team);

export const TEAM_LABELS: Record<NotifyTeam, string> = {
  graphic: "Graphic + Content",
  kol: "KOL",
  vdo: "VDO",
  general: "งานทั่วไป (DM เท่านั้น)",
  finance: "การเงิน (DM เท่านั้น)",
};

/** Slack channel each audience posts to — for the docs and Settings, since the
 *  webhook URL itself never says which room it points at. */
export const TEAM_CHANNEL: Partial<Record<NotifyTeam, string>> = {
  graphic: "#05_marketing_graphic",
  kol: "#04_marketing_kol",
  vdo: "#06_marketing_vdo",
};

/** Env var holding each channel team's incoming webhook. */
export const TEAM_ENV: Partial<Record<NotifyTeam, string>> = {
  graphic: "SLACK_WEBHOOK_URL_GRAPHIC",
  kol: "SLACK_WEBHOOK_URL_KOL",
  vdo: "SLACK_WEBHOOK_URL_VDO",
};

/** Fallback routing from the page a notification links to. Graphic requests
 *  also cover video, and the link cannot tell them apart — those call sites
 *  pass `team` explicitly from workKind() instead. */
export function teamFromLink(link: string | undefined): NotifyTeam {
  const path = (link || "").split(/[?#]/)[0].toLowerCase();
  if (path.startsWith("/finance") || path.startsWith("/expenses")) return "finance";
  if (path.startsWith("/kol")) return "kol";
  if (path.startsWith("/graphic") || path.startsWith("/content")) return "graphic";
  return "general";
}

/** Final routing decision: an explicit team always wins over the link. */
export function resolveTeam(team: string | undefined, link: string | undefined): NotifyTeam {
  if (team && (NOTIFY_TEAMS as string[]).includes(team)) return team as NotifyTeam;
  return teamFromLink(link);
}
