// Lightweight in-app toasts — replaces browser alert() for error/info feedback
// so failures don't block the UI thread or interrupt typing. Fire-and-forget:
// the Toaster component (mounted in AppShell) listens and renders the stack.

export type ToastTone = "error" | "success" | "info";

export interface ToastPayload { message: string; tone: ToastTone }

export const TOAST_EVENT = "app-toast";

export function toast(message: string, tone: ToastTone = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, tone } }));
}

export function toastError(message: string): void {
  toast(message, "error");
}

export function toastSuccess(message: string): void {
  toast(message, "success");
}
