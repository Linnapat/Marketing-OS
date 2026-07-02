// Dashboard aggregates — ported from Dashboard.dc.html (Team Result Dashboard).
// In production these are computed server-side from the module tables; here they are
// pre-aggregated mock values shaped to match the Dev Handoff dashboard schema.

import { Tone } from "@/lib/status";
import { Kpi } from "@/components/ui/KpiCard";

export const OVERALL_KPIS: Kpi[] = [
  { label: "Marketing Revenue", value: "฿8.2M", meta: "Target ฿9.5M", bar: 86, barColor: "#B8945A", footLeft: "86% of target", footRight: "+12% vs last mo.", footRightColor: "#4E7A4E" },
  { label: "Total Visits", value: "12,400", meta: "Target 14,000", bar: 89, barColor: "#3E5C9A", footLeft: "89% of target", footLeftColor: "#3E5C9A", footRight: "+8% vs last mo.", footRightColor: "#4E7A4E" },
  { label: "Repeat Rate", value: "34%", meta: "Target 40%", bar: 85, barColor: "#C68A1E", track: "#EDD5A0", cardBg: "#FBF8EE", cardBorder: "#E8CCA0", labelColor: "#C68A1E", valColor: "#C68A1E", footLeft: "85% of target", footLeftColor: "#C68A1E", footRight: "+2% vs last mo.", footRightColor: "#C68A1E" },
  { label: "Blended ROAS", value: "3.2×", meta: "Target 2.5×", bar: 100, barColor: "#4E7A4E", track: "#C8E0C8", cardBg: "#EEF4EE", cardBorder: "#C8E0C8", labelColor: "#4E7A4E", valColor: "#4E7A4E", footLeft: "128% of target", footLeftColor: "#4E7A4E", footRight: "+0.4× QoQ", footRightColor: "#4E7A4E" },
  { label: "Budget Used", value: "63%", meta: "฿2.84M / ฿4.5M", bar: 63, barColor: "#B8945A", footLeft: "63% of target", footRight: "฿1.66M left" },
  { label: "Achievement", value: "87%", meta: "Overall target", bar: 87, barColor: "#B8945A", track: "#3A3630", cardBg: "#211F1C", cardBorder: "#211F1C", labelColor: "#B8945A", valColor: "#fff", metaColor: "#cabfa9", footLeft: "87% of target", footLeftColor: "#B8945A", footRight: "On track", footRightColor: "#9de09d" },
];

export type Health = "excellent" | "ontrack" | "attention" | "below";

export const HEALTH_TONE: Record<Health, { tone: Tone; label: string; bar: string }> = {
  excellent: { tone: "green", label: "Excellent", bar: "#4E7A4E" },
  ontrack: { tone: "green", label: "On track", bar: "#4E7A4E" },
  attention: { tone: "gold", label: "Needs attention", bar: "#C68A1E" },
  below: { tone: "red", label: "Below target", bar: "#B33A2E" },
};

export interface TeamResult {
  id: string;
  label: string;
  icon: string;
  health: Health;
  achievement: number;
  achieveTarget: string;
  href: string;
  kpis: { label: string; val: string; sub: string; color: string }[];
  bestResult: string;
  nextAction: string;
}

export const TEAM_RESULTS: TeamResult[] = [
  {
    id: "crm", label: "CRM Result", icon: "💬", health: "attention",
    achievement: 85, achieveTarget: "repeat rate", href: "/",
    kpis: [
      { label: "New Members", val: "1,240", sub: "/ 1,500 target", color: "#211F1C" },
      { label: "Repeat Rate", val: "34%", sub: "target 40%", color: "#C68A1E" },
      { label: "15D Revisit", val: "8.2%", sub: "target 10%", color: "#C68A1E" },
      { label: "CRM Revenue", val: "฿1.8M", sub: "+6% vs last", color: "#4E7A4E" },
    ],
    bestResult: "OMD Central World — 42% repeat rate",
    nextAction: "Push Day 14 revisit campaign for Park Silom",
  },
  {
    id: "marketing", label: "Marketing / Campaign", icon: "🎯", health: "ontrack",
    achievement: 92, achieveTarget: "revenue target", href: "/campaigns",
    kpis: [
      { label: "Campaign Revenue", val: "฿4.6M", sub: "/ ฿5.0M target", color: "#211F1C" },
      { label: "Visits", val: "8,420", sub: "/ 9,000 target", color: "#3E5C9A" },
      { label: "ROAS", val: "14.8×", sub: "target 12×", color: "#4E7A4E" },
      { label: "Budget Used", val: "68%", sub: "฿3.1M / ฿4.5M", color: "#B8945A" },
    ],
    bestResult: "OMD Lunch Set — ROAS 22×, 2,840 visits",
    nextAction: "Review TEPPEN Dinner targeting (ROAS 4.2×)",
  },
  {
    id: "creative", label: "Creative Result", icon: "🎨", health: "ontrack",
    achievement: 87, achieveTarget: "on-time delivery", href: "/graphic",
    kpis: [
      { label: "Delivered", val: "42", sub: "/ 48 requested", color: "#211F1C" },
      { label: "On-time", val: "87%", sub: "target 90%", color: "#C68A1E" },
      { label: "Avg Revision", val: "1.6", sub: "target 1.5 rds", color: "#C68A1E" },
      { label: "Waiting Feedback", val: "5", sub: "items pending", color: "#B33A2E" },
    ],
    bestResult: "OMD Reel Cover Set — approved in 1 round",
    nextAction: "Review 5 assets waiting feedback from Brand Lead",
  },
  {
    id: "kol", label: "KOL Result", icon: "🌟", health: "excellent",
    achievement: 117, achieveTarget: "ROI target", href: "/kol",
    kpis: [
      { label: "Posted Creators", val: "12", sub: "/ 15 active", color: "#211F1C" },
      { label: "Total Reach", val: "840K", sub: "+18% vs last", color: "#4E7A4E" },
      { label: "CPV", val: "฿137", sub: "target ฿150", color: "#4E7A4E" },
      { label: "ROI", val: "9.4×", sub: "target 8×", color: "#4E7A4E" },
    ],
    bestResult: "Foodie Bangkok — 245K reach, CPV ฿92",
    nextAction: "Follow up 2 creators missing post links",
  },
];

export interface TeamHealth {
  team: string; icon: string; kpiLabel: string; result: string; target: string;
  bar: number; health: Health; valColor: string; insight: string;
}

export const TEAM_HEALTH: TeamHealth[] = [
  { team: "CRM", icon: "💬", kpiLabel: "Repeat Rate", result: "34%", target: "40%", bar: 85, health: "attention", valColor: "#C68A1E", insight: "Repeat rate below target. Push Day 14 revisit campaign for weakest branch." },
  { team: "Marketing", icon: "🎯", kpiLabel: "Campaign Revenue", result: "฿4.6M", target: "฿5M", bar: 92, health: "ontrack", valColor: "#211F1C", insight: "ROAS exceeds target at 14.8×. Review TEPPEN Dinner underperformance." },
  { team: "Creative", icon: "🎨", kpiLabel: "On-time Delivery", result: "87%", target: "90%", bar: 87, health: "ontrack", valColor: "#211F1C", insight: "Close to target. Clear 5 waiting feedback items to improve on-time rate." },
  { team: "KOL", icon: "🌟", kpiLabel: "ROI", result: "9.4×", target: "8×", bar: 100, health: "excellent", valColor: "#4E7A4E", insight: "Exceeding ROI target. Complete result tracking for 3 remaining creators." },
];

export interface DashAlert {
  type: string; team: string; tone: Tone; title: string; meta: string;
}

export const DASH_ALERTS: DashAlert[] = [
  { type: "BELOW TARGET", team: "CRM", tone: "gold", title: "Repeat Rate 34% vs 40% target", meta: "Push Day 14 revisit · Park Silom branch" },
  { type: "ROAS BELOW", team: "Marketing", tone: "red", title: "TEPPEN Dinner — ROAS 4.2× (target 12×)", meta: "Review targeting and offer · ฿180K spent" },
  { type: "WAITING", team: "Creative", tone: "gold", title: "5 assets waiting feedback >3 days", meta: "Brand Lead review needed · affects 2 campaigns" },
  { type: "MISSING DATA", team: "KOL", tone: "red", title: "2 creators missing post links", meta: "Results cannot be tracked until links added" },
  { type: "APPROVAL 5 DAYS", team: "Finance", tone: "red", title: "Q3 media plan approval pending", meta: "฿1.2M · waiting CMO sign-off" },
];

export interface DashApproval { title: string; meta: string; waiting: string; }

export const DASH_APPROVALS: DashApproval[] = [
  { title: "Q3 media plan", meta: "Campaign · All Brands · ฿1.2M", waiting: "5 days" },
  { title: "Songkran budget request", meta: "Budget · TEPPEN · ฿180,000", waiting: "4 days" },
  { title: "Wagyu key visual V2", meta: "Graphic · TEPPEN", waiting: "3 days" },
  { title: "KOL contract — Nong Aim", meta: "KOL · TEPPEN · ฿45,000", waiting: "2 days" },
  { title: "Menu redesign final", meta: "Graphic · Touka · 2 revisions", waiting: "1 day" },
];

export interface Pulse { icon: string; val: string; label: string; fg: string; bg: string; border: string; }

export const TEAM_PULSE: Pulse[] = [
  { icon: "🌿", val: "2", label: "Healthy", fg: "#4E7A4E", bg: "#EEF4EE", border: "#C8E0C8" },
  { icon: "🔥", val: "2", label: "Busy", fg: "#C68A1E", bg: "#FBF8EE", border: "#E8CCA0" },
  { icon: "🛟", val: "2", label: "Needs support", fg: "#B33A2E", bg: "#FFF5F4", border: "#F5C8C4" },
  { icon: "🧱", val: "4", label: "Stuck tasks", fg: "#C2691E", bg: "#FBF1E9", border: "#F0D5BC" },
  { icon: "✅", val: "12", label: "Done today", fg: "#4E7A4E", bg: "#EEF4EE", border: "#C8E0C8" },
];
