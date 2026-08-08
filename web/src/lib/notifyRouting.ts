import { workKind } from "@/lib/data/graphic";
// Where a notification goes. Shared by the client helper (lib/notify) and the
// API route so both agree on one set of rules.
//
// The team's own channel structure decides this, not ours:
//
//   KOL work      → #04_marketing_kol
//   VDO work      → #06_marketing_vdo      (งานตัด and งานถ่าย both)
//   Graphic work  → #05_marketing_graphic
//   Content work  → #07_marketing_content  (posts, captions, publishing)
//   Everything else — campaigns, tasks, asking for help — goes to the people
//   involved as a DM and to no channel at all.
//   Money never reaches a channel: it is DM'd to one person (SLACK_FINANCE_DM).
//
// So "team" is really "which audience", and only four of them are rooms.
//
// Content used to share #05 with graphic work. It stopped being one audience
// once caption sign-off became its own step: a designer scrolling for the piece
// they were asked to fix had to read past every caption someone approved.

export type NotifyTeam = "kol" | "vdo" | "graphic" | "content" | "general" | "finance";

export const NOTIFY_TEAMS: NotifyTeam[] = ["graphic", "content", "kol", "vdo", "general", "finance"];

/** The audiences that have a Slack channel. The rest are DM-only by design. */
export const CHANNEL_TEAMS: NotifyTeam[] = ["graphic", "content", "kol", "vdo"];

export const hasChannel = (team: NotifyTeam): boolean =>
  (CHANNEL_TEAMS as string[]).includes(team);

export const TEAM_LABELS: Record<NotifyTeam, string> = {
  graphic: "Graphic",
  content: "Content (โพสต์ + แคปชั่น)",
  kol: "KOL",
  vdo: "VDO",
  general: "งานทั่วไป (DM เท่านั้น)",
  finance: "การเงิน (DM เท่านั้น)",
};

/** Slack channel each audience posts to — for the docs and Settings, since the
 *  webhook URL itself never says which room it points at. */
export const TEAM_CHANNEL: Partial<Record<NotifyTeam, string>> = {
  graphic: "#05_marketing_graphic",
  content: "#07_marketing_content",
  kol: "#04_marketing_kol",
  vdo: "#06_marketing_vdo",
};

/** Env var holding each channel team's incoming webhook. */
export const TEAM_ENV: Partial<Record<NotifyTeam, string>> = {
  graphic: "SLACK_WEBHOOK_URL_GRAPHIC",
  content: "SLACK_WEBHOOK_URL_CONTENT",
  kol: "SLACK_WEBHOOK_URL_KOL",
  vdo: "SLACK_WEBHOOK_URL_VDO",
};

/** A room to borrow when a team's own is not wired yet. Only Content has one,
 *  and only because #05 is where its messages already went: if the room it was
 *  given ever stops working, caption sign-off falls back to the room the team
 *  was already reading instead of going silent until someone notices. Every
 *  other team stays quiet rather than post to a room it does not belong in —
 *  the rule this bends is "wrong room is worse than no room", and the room
 *  Content came from is not the wrong room. */
export const TEAM_FALLBACK: Partial<Record<NotifyTeam, NotifyTeam>> = {
  content: "graphic",
};

/** Fallback routing from the page a notification links to. Graphic requests
 *  also cover video, and the link cannot tell them apart — those call sites
 *  pass `team` explicitly from workKind() instead. */
export function teamFromLink(link: string | undefined): NotifyTeam {
  const path = (link || "").split(/[?#]/)[0].toLowerCase();
  if (path.startsWith("/finance") || path.startsWith("/expenses")) return "finance";
  if (path.startsWith("/kol")) return "kol";
  if (path.startsWith("/content")) return "content";
  if (path.startsWith("/graphic")) return "graphic";
  return "general";
}

/** Final routing decision: an explicit team always wins over the link. */
export function resolveTeam(team: string | undefined, link: string | undefined): NotifyTeam {
  if (team && (NOTIFY_TEAMS as string[]).includes(team)) return team as NotifyTeam;
  return teamFromLink(link);
}

// ── In-app inbox ───────────────────────────────────────────────────────────
//
// The bell had its own writer (db/notifications.pushNotifications) and only
// four call sites ever used it, against forty-two for notify(). So Slack knew
// a piece of artwork had been sent back and the app did not: on 2 Aug 2026 the
// production `notifications` table held zero rows while twenty-two Slack
// messages had gone out the same day, and the bell read "ไม่มีอะไรค้างอยู่".
//
// One call now feeds both. This map is the translation, and it lives here
// rather than in db/notifications because that file is "use client" and the
// API route cannot import it.

/** Inbox categories. The first four predate this and are already in the table;
 *  the rest exist because notify() carries events the inbox had no word for. */
export type InboxKind = "comment" | "revision" | "brief" | "assigned" | "approval" | "approved" | "launch";

const EVENT_TO_INBOX: Record<string, InboxKind> = {
  newTask: "assigned",
  approval: "approval",
  mention: "comment",
  feedback: "revision",
  approved: "approved",
  rejected: "revision",
  launch: "launch",
};

/** Which inbox row a notify() event becomes. Unknown events land under
 *  "assigned" rather than being dropped: an inbox that silently discards what
 *  it does not recognise is how this gap opened in the first place. */
export const inboxKind = (event: string | undefined): InboxKind =>
  EVENT_TO_INBOX[event ?? ""] ?? "assigned";

/** Which room a graphic request belongs to. A "Graphic Request" is the form for
 *  video work too, so the module can't decide this — workKind() reads the type
 *  the requester picked, the same classifier the capacity board counts by.
 *
 *  Lives here rather than inside the drawer because the request's conversation
 *  is now posted from two screens, and a second copy of this rule would route
 *  the same request to two different rooms depending on where you typed. */
export function graphicTeam(g: { type: string; requiredVideo?: boolean }): NotifyTeam {
  return workKind(g.type, g.requiredVideo).startsWith("vdo") ? "vdo" : "graphic";
}
