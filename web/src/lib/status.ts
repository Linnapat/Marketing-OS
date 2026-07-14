// Status tone system — a small set of semantic tones reused across every module,
// mirroring the color pairs baked into the design files (fg text + soft bg).

export type Tone = "neutral" | "gold" | "red" | "green" | "blue" | "orange" | "ink";

export const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "#8A879A", bg: "#F4F2F8" },
  gold: { fg: "#B78E2D", bg: "#FFF3D7" },
  red: { fg: "#E15B5B", bg: "#FFF0F0" },
  green: { fg: "#5D9E35", bg: "#F0F8D8" },
  blue: { fg: "#4D61D6", bg: "#EEE9FF" },
  orange: { fg: "#DD8A2F", bg: "#FFF3E5" },
  ink: { fg: "#17172A", bg: "#ECEAF2" },
};

// Campaign status → tone, from campStatusMap in the design.
export const CAMPAIGN_STATUS_TONE: Record<string, Tone> = {
  Draft: "neutral",
  Planning: "gold",
  "In Progress": "blue",
  "Waiting Approval": "gold",
  // Campaign Brief workflow statuses
  "Ready for Review": "blue",
  "Waiting for Approval": "gold",
  "Need Revision": "orange",
  Approved: "green",
  Active: "blue",
  Paused: "orange",
  Inactive: "neutral",
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
