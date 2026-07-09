// Remembered voucher signatures. Stored locally (per browser) so Finance can
// reuse a preparer / approver signature across approvals in the same session.

export type SignatureRole = "preparer" | "approver";

const KEY: Record<SignatureRole, string> = {
  preparer: "mos:signature:preparer",
  approver: "mos:signature:approver",
};

export function getSavedSignature(role: SignatureRole = "approver"): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(KEY[role]); } catch { return null; }
}

export function saveSignature(role: SignatureRole, dataUrl: string): void {
  try { localStorage.setItem(KEY[role], dataUrl); } catch { /* ignore */ }
}

export function clearSignature(role?: SignatureRole): void {
  try {
    if (role) localStorage.removeItem(KEY[role]);
    else Object.values(KEY).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
