// Presentation bits for Team Workload.
//
// The real workload numbers are derived from live tasks and graphic requests in
// lib/data/derive (teamFromDb) — see the rules there. This file used to also
// carry a whole mock team (MEMBERS with workloadScore / capacityTarget: 35 /
// utilization: 137%), plus mock bottlenecks and recommendations, ported from
// the original HTML. None of it was read by the page, but it looked like the
// live model and invited people to trust or extend numbers that were typed in
// by hand. Only what the page actually uses is kept.

export type Capacity = "healthy" | "busy" | "needsSupport";

export const CAPACITY_META: Record<Capacity, { label: string; emoji: string; fg: string; bg: string; border: string }> = {
  healthy: { label: "Healthy", emoji: "🌿", fg: "#4E7A4E", bg: "#EEF4EE", border: "#C8E0C8" },
  busy: { label: "Busy", emoji: "🔥", fg: "#C68A1E", bg: "#FBF8EE", border: "#E8CCA0" },
  needsSupport: { label: "Needs support", emoji: "🛟", fg: "#B33A2E", bg: "#FFF5F4", border: "#F5C8C4" },
};

export function initials(name: string): string {
  return (name.slice(0, 1) + (name.split(" ")[1] || "").slice(0, 1)).toUpperCase();
}
