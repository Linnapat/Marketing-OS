// Fire-and-forget client for /api/notify (LINE group + email). Never blocks or
// throws — a notification failure must not break the action that triggered it.
// Event keys match Settings → Notifications triggers so admins can mute them.

export type NotifyEvent =
  | "newTask"    // task created / reassigned
  | "approval"   // something waits for an approver
  | "mention"    // ask-for-help / comments aimed at someone
  | "feedback"   // graphic submitted / revision loop
  | "approved"   // request or work approved
  | "rejected"   // request sent back
  | "launch";    // campaign submitted / published

export function notify(event: NotifyEvent, title: string, detail?: string, link?: string): void {
  try {
    void fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, title, detail, link }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* notifications are best-effort */
  }
}
