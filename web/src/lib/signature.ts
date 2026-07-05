// Remembered approval signature. Stored locally (per browser) so an approver
// signs once and later approvals only need a Confirm click.

const KEY = "mos:approval-signature";

export function getSavedSignature(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function saveSignature(dataUrl: string): void {
  try { localStorage.setItem(KEY, dataUrl); } catch { /* ignore */ }
}

export function clearSignature(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
