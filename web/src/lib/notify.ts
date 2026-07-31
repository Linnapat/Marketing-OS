// Fire-and-forget client for /api/notify (Slack + LINE group + email). Never
// blocks or throws — a notification failure must not break the action that
// triggered it. Event keys match Settings → Notifications triggers so admins
// can mute them.
//
// The optional `team` picks which Slack channel receives it. Leave it out and
// the server routes on the link (see lib/notifyRouting); pass it when the link
// points somewhere other than the work it is about — a graphic revision, for
// instance, links to /my-tasks so the designer lands on their queue, but still
// belongs in the creative channel.

import type { NotifyTeam } from "@/lib/notifyRouting";

export type { NotifyTeam };

export type NotifyEvent =
  | "newTask"    // task created / reassigned
  | "approval"   // something waits for an approver
  | "mention"    // ask-for-help / comments aimed at someone
  | "feedback"   // graphic submitted / revision loop
  | "approved"   // request or work approved
  | "rejected"   // request sent back
  | "launch";    // campaign submitted / published

/** Extra routing for one notification. `to` names the people the event is FOR
 *  (assigned, asked to revise) — they get a Slack DM and the team channel sees
 *  it in the daily digest instead of one interruption per event. Leave it out
 *  for anything the channel should see immediately. */
export interface NotifyTarget {
  team?: NotifyTeam;
  to?: (string | null | undefined)[];
}

export function notify(event: NotifyEvent, title: string, detail?: string, link?: string, target?: NotifyTeam | NotifyTarget): void {
  const { team, to } = typeof target === "string" ? { team: target, to: undefined } : (target ?? {});
  const recipients = (to ?? []).map((n) => (n ?? "").trim()).filter((n) => n && n !== "Unassigned");
  void (async () => {
    try {
      const { authHeaders } = await import("@/lib/supabase");
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ event, title, detail, link, team, to: recipients }),
        keepalive: true,
      });
      void res;
    } catch {
      /* notifications are best-effort */
    }
  })();
}
