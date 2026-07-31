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

export function notify(event: NotifyEvent, title: string, detail?: string, link?: string, team?: NotifyTeam): void {
  void (async () => {
    try {
      const { authHeaders } = await import("@/lib/supabase");
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ event, title, detail, link, team }),
        keepalive: true,
      });
      void res;
    } catch {
      /* notifications are best-effort */
    }
  })();
}
