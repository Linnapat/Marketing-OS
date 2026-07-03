// Team Workload — ported from TeamWorkload.dc.html. A calm, supportive workload view:
// weighted workload score + utilization, bottlenecks by module, and rebalance ideas.

export type Capacity = "healthy" | "busy" | "needsSupport";

export interface Member {
  id: string;
  name: string;
  role: string;
  tasks: number;
  doneToday: number;
  inProgress: number;
  waiting: number;
  stuck: number;
  needsAttention: number;
  feedback: number;
  revisions: number;
  urgent: number;
  workloadScore: number;
  capacityTarget: number;
  utilization: number;
  capacityStatus: Capacity;
  mainBottleneck: string;
  suggestedAction: string;
  oldestWaitingDays: number;
}

export const MEMBERS: Member[] = [
  { id: "aran", name: "Aran P.", role: "Marketing Director", tasks: 18, doneToday: 3, inProgress: 7, waiting: 3, stuck: 1, needsAttention: 2, feedback: 5, revisions: 3, urgent: 2, workloadScore: 48, capacityTarget: 35, utilization: 137, capacityStatus: "needsSupport", mainBottleneck: "3 campaign approvals pending across teams", suggestedAction: "Delegate 2 mid-priority approvals to team leads", oldestWaitingDays: 4 },
  { id: "ken", name: "Ken S.", role: "Content Lead", tasks: 14, doneToday: 2, inProgress: 5, waiting: 4, stuck: 1, needsAttention: 1, feedback: 6, revisions: 2, urgent: 1, workloadScore: 38, capacityTarget: 35, utilization: 109, capacityStatus: "busy", mainBottleneck: "Waiting brief approval from Nok for LINE copy", suggestedAction: "Follow up Nok on brief confirmation today", oldestWaitingDays: 2 },
  { id: "boss", name: "Boss", role: "Senior Designer", tasks: 16, doneToday: 1, inProgress: 6, waiting: 4, stuck: 2, needsAttention: 3, feedback: 9, revisions: 7, urgent: 2, workloadScore: 52, capacityTarget: 35, utilization: 149, capacityStatus: "needsSupport", mainBottleneck: "Waiting requester feedback on 4 design revisions", suggestedAction: "Move 2 low-priority tasks, follow up feedback today", oldestWaitingDays: 5 },
  { id: "nok", name: "Nok W.", role: "Campaign Manager", tasks: 12, doneToday: 2, inProgress: 4, waiting: 3, stuck: 0, needsAttention: 1, feedback: 3, revisions: 1, urgent: 1, workloadScore: 30, capacityTarget: 35, utilization: 86, capacityStatus: "busy", mainBottleneck: "Rainy Season budget request pending approval", suggestedAction: "Review and approve pending budget today", oldestWaitingDays: 1 },
  { id: "ploy", name: "Ploy R.", role: "KOL Specialist", tasks: 10, doneToday: 2, inProgress: 4, waiting: 1, stuck: 0, needsAttention: 0, feedback: 2, revisions: 0, urgent: 1, workloadScore: 24, capacityTarget: 35, utilization: 69, capacityStatus: "healthy", mainBottleneck: "None — on track", suggestedAction: "Can take 1–2 additional tasks if needed", oldestWaitingDays: 0 },
  { id: "mei", name: "Mei T.", role: "Performance Analyst", tasks: 9, doneToday: 2, inProgress: 3, waiting: 1, stuck: 0, needsAttention: 0, feedback: 1, revisions: 0, urgent: 0, workloadScore: 18, capacityTarget: 35, utilization: 51, capacityStatus: "healthy", mainBottleneck: "None — on track", suggestedAction: "Can take 2–3 additional tasks", oldestWaitingDays: 0 },
];

export const CAPACITY_META: Record<Capacity, { label: string; emoji: string; fg: string; bg: string; border: string }> = {
  healthy: { label: "Healthy", emoji: "🌿", fg: "#4E7A4E", bg: "#EEF4EE", border: "#C8E0C8" },
  busy: { label: "Busy", emoji: "🔥", fg: "#C68A1E", bg: "#FBF8EE", border: "#E8CCA0" },
  needsSupport: { label: "Needs support", emoji: "🛟", fg: "#B33A2E", bg: "#FFF5F4", border: "#F5C8C4" },
};

export function capacityLabel(u: number): string {
  if (u >= 120) return "Full capacity";
  if (u >= 90) return "Balanced";
  if (u >= 70) return "Can take more";
  return "Lots of room";
}

export const MEMBER_COLOR: Record<string, string> = {
  aran: "#B8945A", ken: "#3E5C9A", boss: "#4E7A4E", nok: "#6b6258", ploy: "#B5577E", mei: "#3E7A7A",
};

export interface Bottleneck {
  module: string; icon: string; stuckCount: number; mainReason: string;
  pendingApprover: string; oldestDays: number; suggestedAction: string; color: string; bg: string;
}

export const BOTTLENECKS: Bottleneck[] = [
  { module: "Graphic", icon: "🎨", stuckCount: 5, mainReason: "Waiting requester feedback", pendingApprover: "Brand Lead", oldestDays: 5, suggestedAction: "Follow up feedback requests today", color: "#C2691E", bg: "#FBF1E9" },
  { module: "Content", icon: "✍️", stuckCount: 2, mainReason: "Brief not confirmed by Campaign", pendingApprover: "Nok W.", oldestDays: 2, suggestedAction: "Confirm brief today", color: "#3E5C9A", bg: "#EEF1F8" },
  { module: "Approval", icon: "✅", stuckCount: 3, mainReason: "Waiting CMO sign-off", pendingApprover: "Aran P.", oldestDays: 4, suggestedAction: "Schedule an approval round today", color: "#4E7A4E", bg: "#EEF4EE" },
  { module: "Budget", icon: "฿", stuckCount: 1, mainReason: "Pending budget approval", pendingApprover: "Aran P.", oldestDays: 1, suggestedAction: "Approve or delegate", color: "#4E7A4E", bg: "#EEF4EE" },
  { module: "KOL", icon: "🌟", stuckCount: 1, mainReason: "Waiting draft from KOL", pendingApprover: "—", oldestDays: 3, suggestedAction: "Follow up KOL for draft submission", color: "#B5577E", bg: "#FBF0F5" },
];

export interface Rec { icon: string; text: string; reason: string; actionLabels: string[]; }

export const RECS: Rec[] = [
  { icon: "✨", text: "Move 2 light design tasks from Boss to Mei T.", reason: "Boss is at 149% capacity — Mei has room to take more.", actionLabels: ["View tasks", "Reassign"] },
  { icon: "⏳", text: "Follow up Brand Lead for 3 pending design approvals", reason: "Oldest waiting 5 days — blocking Boss and whole Graphic queue.", actionLabels: ["View tasks", "Follow up"] },
  { icon: "🧱", text: "Ask requesters to complete 2 missing content briefs", reason: "Ken S. is blocked waiting for brief confirmation.", actionLabels: ["View tasks", "Follow up"] },
  { icon: "✨", text: "Ploy R. and Mei T. can take more tasks today", reason: "Both under 70% capacity — good day to rebalance.", actionLabels: ["View tasks"] },
];

export function pulse() {
  const healthy = MEMBERS.filter((m) => m.capacityStatus === "healthy").length;
  const busy = MEMBERS.filter((m) => m.capacityStatus === "busy").length;
  const needsSupport = MEMBERS.filter((m) => m.capacityStatus === "needsSupport").length;
  const stuck = BOTTLENECKS.reduce((s, b) => s + b.stuckCount, 0);
  const needsAttention = MEMBERS.reduce((s, m) => s + m.needsAttention, 0);
  const doneToday = MEMBERS.reduce((s, m) => s + m.doneToday, 0);
  return { healthy, busy, needsSupport, stuck, needsAttention, doneToday };
}

export function initials(name: string): string {
  return (name.slice(0, 1) + (name.split(" ")[1] || "").slice(0, 1)).toUpperCase();
}
