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
  void (async () => {
    try {
      const { authHeaders } = await import("@/lib/supabase");
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ event, title, detail, link }),
        keepalive: true,
      });
      void res;
    } catch {
      /* notifications are best-effort */
    }
  })();
}
