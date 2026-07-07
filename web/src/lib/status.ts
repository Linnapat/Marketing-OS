// Status tone system — a small set of semantic tones reused across every module,
// mirroring the color pairs baked into the design files (fg text + soft bg).

export type Tone = "neutral" | "gold" | "red" | "green" | "blue" | "orange" | "ink";

export const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "#6b6258", bg: "#F0EDE6" },
  gold: { fg: "#C68A1E", bg: "#FBF8EE" },
  red: { fg: "#B33A2E", bg: "#FFF5F4" },
  green: { fg: "#4E7A4E", bg: "#EEF4EE" },
  blue: { fg: "#3E5C9A", bg: "#eef1f8" },
  orange: { fg: "#C2691E", bg: "#FBF1E9" },
  ink: { fg: "#211F1C", bg: "#ECE6DA" },
};

// Campaign status → tone, from campStatusMap in the design.
export const CAMPAIGN_STATUS_TONE: Record<string, Tone> = {
  Draft: "neutral",
  Planning: "blue",
  "In Progress": "blue",
  "Waiting Approval": "gold",
  // Campaign Brief workflow statuses
  "Ready for Review": "blue",
  "Waiting for Approval": "gold",
  "Need Revision": "orange",
  Approved: "green",
  Active: "green",
  Completed: "ink",
  Cancelled: "red",
};

export function campaignTone(status: string): Tone {
  return CAMPAIGN_STATUS_TONE[status] ?? "neutral";
}

// KOL / deliverable / comment statuses → tone, from kolStatusMap in the design.
export const KOL_STATUS_TONE: Record<string, Tone> = {
  Prospect: "neutral", Shortlisted: "blue", Negotiating: "gold",
  Request: "neutral", "Owner Assigned": "blue", Producing: "blue", "In Review": "gold",
  "Contract Pending": "gold", "Contract Signed": "green", "Brief Sent": "blue",
  "Content Creating": "blue", "Draft Submitted": "gold", "Waiting Review": "gold",
  "Revision Requested": "red", "Approved to Post": "green", Scheduled: "green",
  Posted: "green", Reporting: "neutral", Completed: "ink",
  Paused: "red", Cancelled: "neutral", Active: "green", Approved: "green",
  Pending: "gold", Unpaid: "red", Paid: "green", Signed: "green", Issued: "blue",
  Resolved: "green", Open: "red", "In progress": "blue", "Waiting reply": "gold",
  "Not issued": "neutral", "Not started": "neutral",
};

export function kolTone(status: string): Tone {
  return KOL_STATUS_TONE[status] ?? "neutral";
}
