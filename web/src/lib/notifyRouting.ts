// Which Slack channel a notification belongs to. Shared by the client helper
// (lib/notify) and the API route so both agree on one set of rules.
//
// Slack notifications are split per team so #finance isn't buried under artwork
// revisions and Creative doesn't get paged for every expense claim. Each team
// maps to its own incoming webhook; an unset team webhook falls back to the
// general one, so setting SLACK_WEBHOOK_URL alone keeps the previous
// everything-in-one-channel behaviour.

export type NotifyTeam = "finance" | "creative" | "general";

export const NOTIFY_TEAMS: NotifyTeam[] = ["general", "finance", "creative"];

/** Human label used in Settings → Integrations. */
export const TEAM_LABELS: Record<NotifyTeam, string> = {
  general: "General",
  finance: "Finance",
  creative: "Creative",
};

/** Env var holding each team's incoming webhook. */
export const TEAM_ENV: Record<NotifyTeam, string> = {
  general: "SLACK_WEBHOOK_URL",
  finance: "SLACK_WEBHOOK_URL_FINANCE",
  creative: "SLACK_WEBHOOK_URL_CREATIVE",
};

/** Route by the page the notification links to. Callers whose link points
 *  somewhere else than the work it is about (e.g. a graphic revision that links
 *  to /my-tasks so the fixer lands on their queue) pass `team` explicitly. */
export function teamFromLink(link: string | undefined): NotifyTeam {
  const path = (link || "").split(/[?#]/)[0].toLowerCase();
  if (path.startsWith("/finance") || path.startsWith("/expenses")) return "finance";
  if (path.startsWith("/graphic") || path.startsWith("/content")) return "creative";
  return "general";
}

/** Final routing decision: an explicit team always wins over the link. */
export function resolveTeam(team: string | undefined, link: string | undefined): NotifyTeam {
  if (team === "finance" || team === "creative" || team === "general") return team;
  return teamFromLink(link);
}
