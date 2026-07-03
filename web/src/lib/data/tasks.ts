// My Tasks — ported from MyTasks.dc.html. Personal + team task view with a warm,
// encouraging tone (My Day) and a manager overview (Team View).

import { Tone } from "@/lib/status";

export interface Task {
  id: number;
  title: string;
  module: string;
  moduleIcon: string;
  moduleColor: string;
  type: string;
  assignee: string;
  brand: string;
  campaign: string;
  status: string;
  priority: "High" | "Med" | "Low";
  group: string;
  due: string;
  blocker: string | null;
  pendingApprover: string | null;
  isQuickWin: boolean;
  nextAction: string;
  checklist: string[];
}

export const STATUS_TONE: Record<string, Tone> = {
  Done: "green", "In Progress": "blue", Waiting: "gold", "Need Approval": "green",
  Stuck: "red", Revision: "orange", Todo: "neutral",
};
export const PRIORITY_TONE: Record<string, Tone> = { High: "red", Med: "gold", Low: "neutral" };
export const TYPE_TONE: Record<string, Tone> = {
  Content: "blue", KOL: "red", Graphic: "orange", Budget: "green", Ads: "gold", Report: "neutral", Campaign: "gold",
};

export const PEOPLE = ["Aran P.", "Ken S.", "Boss", "Nok W.", "Ploy R.", "Mei T."];

export const PERSON_COLOR: Record<string, string> = {
  "Aran P.": "#B8945A", "Ken S.": "#3E5C9A", Boss: "#4E7A4E",
  "Nok W.": "#6b6258", "Ploy R.": "#B5577E", "Mei T.": "#3E7A7A",
};

export const PERSON_ROLE: Record<string, string> = {
  "Aran P.": "CMO / Admin", "Ken S.": "Content Planner", Boss: "Graphic / Creator",
  "Nok W.": "Campaign Planner", "Ploy R.": "Brand Lead", "Mei T.": "Data / Ads",
};

export const GREETINGS: Record<string, [string, string]> = {
  "Aran P.": ["Good to see you, Aran 🌿", "Let's move things forward today."],
  "Ken S.": ["Ready for today, Ken? 🌿", "Your content makes the difference."],
  Boss: ["Morning, Boss 🌿", "Your designs bring campaigns to life."],
  "Nok W.": ["Good day, Nok 🌿", "Keep the campaign engine running."],
  "Ploy R.": ["Hello, Ploy 🌿", "Great stories start with a great brief."],
  "Mei T.": ["Hi Mei 🌿", "Data into clarity — that's your superpower."],
};

export interface TaskGroup { key: string; label: string; icon: string; }
export const TASK_GROUPS: TaskGroup[] = [
  { key: "doFirst", label: "Do First", icon: "🎯" },
  { key: "waitingMe", label: "Waiting for Me", icon: "✋" },
  { key: "needApproval", label: "Need Approval", icon: "✅" },
  { key: "quickWins", label: "Quick Wins", icon: "✨" },
  { key: "stuck", label: "Stuck", icon: "🧱" },
  { key: "done", label: "Done", icon: "🌿" },
];

export const TASKS: Task[] = [
  { id: 1, title: "Submit Q3 budget plan", module: "Finance", moduleIcon: "฿", moduleColor: "#4E7A4E", type: "Budget", assignee: "Aran P.", brand: "Teppen", campaign: "Wagyu Festival", status: "Done", priority: "High", group: "done", due: "Jun 25", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Completed — well done!", checklist: ["Draft P&L", "CFO sign-off", "Submit portal"] },
  { id: 2, title: "Review Wagyu Festival KPI dashboard", module: "Campaign", moduleIcon: "🎯", moduleColor: "#B33A2E", type: "Report", assignee: "Aran P.", brand: "Teppen", campaign: "Wagyu Festival", status: "In Progress", priority: "High", group: "doFirst", due: "Jul 2", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Review the KPI numbers and flag gaps before the team meeting.", checklist: ["Check reach vs target", "Validate ad spend", "Review ROI"] },
  { id: 3, title: "Approve summer reel final design", module: "Graphic", moduleIcon: "🎨", moduleColor: "#C2691E", type: "Graphic", assignee: "Aran P.", brand: "Omakase", campaign: "Summer Reel Series", status: "Need Approval", priority: "High", group: "needApproval", due: "Jul 2", blocker: null, pendingApprover: "Aran P.", isQuickWin: false, nextAction: "Design is ready. Approve or request revision.", checklist: ["Check CI alignment", "Check copy", "Approve"] },
  { id: 4, title: "Sign KOL contract — Nong Aim", module: "KOL", moduleIcon: "🌟", moduleColor: "#B5577E", type: "KOL", assignee: "Aran P.", brand: "Teppen", campaign: "Wagyu Festival", status: "Done", priority: "Med", group: "done", due: "Jun 1", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Signed and filed.", checklist: [] },
  { id: 5, title: "Content brief for Touka cocktail reel", module: "Content", moduleIcon: "✍️", moduleColor: "#3E5C9A", type: "Content", assignee: "Ken S.", brand: "Touka", campaign: "Cocktail Hour Launch", status: "In Progress", priority: "High", group: "doFirst", due: "Jul 2", blocker: null, pendingApprover: "Ploy R.", isQuickWin: false, nextAction: "Complete the brief and share with KOL specialist by EOD.", checklist: ["Write objective", "Set key message", "Add asset folder link"] },
  { id: 6, title: "LINE OA broadcast copy — Rainy Season", module: "Content", moduleIcon: "✍️", moduleColor: "#3E5C9A", type: "Content", assignee: "Ken S.", brand: "Mainichi", campaign: "Rainy Season Promo", status: "Stuck", priority: "High", group: "stuck", due: "Jul 2", blocker: "Nok W. — brief not confirmed", pendingApprover: "Nok W.", isQuickWin: false, nextAction: "Waiting for brief approval from Nok before copy can proceed.", checklist: ["Get brief confirmed", "Draft copy", "Submit for review"] },
  { id: 7, title: "Brief confirmation — BkkFoodie KOL", module: "KOL", moduleIcon: "🌟", moduleColor: "#B5577E", type: "KOL", assignee: "Ken S.", brand: "Omakase", campaign: "Father's Day Set", status: "Done", priority: "Med", group: "done", due: "Jun 8", blocker: null, pendingApprover: null, isQuickWin: true, nextAction: "Brief sent and confirmed.", checklist: [] },
  { id: 8, title: "Meta ads copy — Songkran promo", module: "Ads", moduleIcon: "📣", moduleColor: "#C68A1E", type: "Ads", assignee: "Ken S.", brand: "Teppen", campaign: "Songkran Teppanyaki", status: "Done", priority: "Med", group: "done", due: "Jun 10", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Submitted to ads team.", checklist: [] },
  { id: 9, title: "Wagyu key visual — Revision 2", module: "Graphic", moduleIcon: "🎨", moduleColor: "#C2691E", type: "Graphic", assignee: "Boss", brand: "Teppen", campaign: "Wagyu Festival", status: "In Progress", priority: "High", group: "doFirst", due: "Jul 2", blocker: null, pendingApprover: "Aran P.", isQuickWin: false, nextAction: "Apply revision notes from Aran. Upload V2 by 5pm today.", checklist: ["Apply copy change", "Fix logo size", "Upload V2 link"] },
  { id: 10, title: "Menu redesign — Touka cocktail hour", module: "Graphic", moduleIcon: "🎨", moduleColor: "#C2691E", type: "Graphic", assignee: "Boss", brand: "Touka", campaign: "Cocktail Hour Launch", status: "Revision", priority: "High", group: "doFirst", due: "Jul 3", blocker: null, pendingApprover: "Ploy R.", isQuickWin: false, nextAction: "Revision notes received from Ploy. Update layout and submit V3.", checklist: ["Update layout", "Recheck copy", "Export all sizes"] },
  { id: 11, title: "Father's Day promotional banner", module: "Graphic", moduleIcon: "🎨", moduleColor: "#C2691E", type: "Graphic", assignee: "Boss", brand: "Omakase", campaign: "Father's Day Set", status: "Waiting", priority: "Med", group: "waitingMe", due: "Jul 3", blocker: "Ken S. — copy not confirmed", pendingApprover: "Ken S.", isQuickWin: false, nextAction: "Waiting for confirmed copy from Ken before design can start.", checklist: [] },
  { id: 12, title: "LINE coupon campaign post-mortem", module: "Campaign", moduleIcon: "🎯", moduleColor: "#B33A2E", type: "Report", assignee: "Nok W.", brand: "Mainichi", campaign: "LINE Coupon Drive", status: "Done", priority: "Low", group: "done", due: "Jun 15", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Report submitted.", checklist: [] },
  { id: 13, title: "Rainy season budget request", module: "Finance", moduleIcon: "฿", moduleColor: "#4E7A4E", type: "Budget", assignee: "Nok W.", brand: "Mainichi", campaign: "Rainy Season Promo", status: "Waiting", priority: "High", group: "waitingMe", due: "Jul 3", blocker: "Aran P. — budget not approved", pendingApprover: "Aran P.", isQuickWin: false, nextAction: "Waiting for Aran to approve the budget before submission.", checklist: ["Get approval", "Submit request"] },
  { id: 14, title: "Add KOL result — Khun Pim post", module: "KOL", moduleIcon: "🌟", moduleColor: "#B5577E", type: "KOL", assignee: "Nok W.", brand: "Mainichi", campaign: "LINE Coupon Drive", status: "Done", priority: "Low", group: "done", due: "May 30", blocker: null, pendingApprover: null, isQuickWin: true, nextAction: "Results logged.", checklist: [] },
  { id: 15, title: "Cocktail launch PR brief", module: "Content", moduleIcon: "✍️", moduleColor: "#3E5C9A", type: "Content", assignee: "Ploy R.", brand: "Touka", campaign: "Cocktail Hour Launch", status: "In Progress", priority: "High", group: "doFirst", due: "Jul 2", blocker: null, pendingApprover: "Aran P.", isQuickWin: false, nextAction: "Finalize the PR brief and send to agency by today.", checklist: ["Write PR angle", "Get approval", "Send to agency"] },
  { id: 16, title: "Touka anniversary campaign planning", module: "Campaign", moduleIcon: "🎯", moduleColor: "#B33A2E", type: "Campaign", assignee: "Ploy R.", brand: "Touka", campaign: "Touka Anniversary", status: "Todo", priority: "Med", group: "quickWins", due: "Jul 10", blocker: null, pendingApprover: null, isQuickWin: true, nextAction: "Start by drafting the campaign brief — just 30 minutes.", checklist: ["Draft campaign brief"] },
  { id: 17, title: "SauceMaster KOL review session", module: "KOL", moduleIcon: "🌟", moduleColor: "#B5577E", type: "KOL", assignee: "Ploy R.", brand: "Touka", campaign: "Cocktail Hour Launch", status: "Need Approval", priority: "High", group: "needApproval", due: "Jul 3", blocker: null, pendingApprover: "Ploy R.", isQuickWin: false, nextAction: "Review SauceMaster's draft video and approve or request revision.", checklist: ["Watch draft video", "Leave feedback", "Approve or revise"] },
  { id: 18, title: "TikTok Wagyu teaser script", module: "Content", moduleIcon: "✍️", moduleColor: "#3E5C9A", type: "Content", assignee: "Mei T.", brand: "Teppen", campaign: "Wagyu Festival", status: "Done", priority: "Med", group: "done", due: "Jun 20", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Script approved and sent to KOL.", checklist: [] },
  { id: 19, title: "Google PPC campaign report — June", module: "Ads", moduleIcon: "📣", moduleColor: "#C68A1E", type: "Ads", assignee: "Mei T.", brand: "Teppen", campaign: "Wagyu Festival", status: "In Progress", priority: "Med", group: "doFirst", due: "Jul 2", blocker: null, pendingApprover: "Aran P.", isQuickWin: false, nextAction: "Pull GA4 data and compile into report template. Due EOD today.", checklist: ["Pull GA4 data", "Calculate ROAS", "Write summary"] },
  { id: 20, title: "Golden Week post-mortem report", module: "Campaign", moduleIcon: "🎯", moduleColor: "#B33A2E", type: "Report", assignee: "Mei T.", brand: "Teppen", campaign: "Golden Week Teaser", status: "Done", priority: "Low", group: "done", due: "May 10", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Done and shared.", checklist: [] },
];

export const CELEBRATIONS = [
  "Nice work — one step lighter ✓", "Done! That felt good 🌿", "Cleared — one less to carry.",
  "Smooth — well done!", "Task complete — you're on a roll!",
];

export interface PersonSummary {
  name: string; role: string; color: string;
  total: number; done: number; active: number; waiting: number; stuck: number; needsAttention: boolean;
}

export function teamSummary(doneIds: Set<number>, source: Task[] = TASKS): PersonSummary[] {
  return PEOPLE.map((name) => {
    const mine = source.filter((t) => t.assignee === name);
    const status = (t: Task) => (doneIds.has(t.id) ? "Done" : t.status);
    const done = mine.filter((t) => status(t) === "Done").length;
    const stuck = mine.filter((t) => status(t) === "Stuck").length;
    const waiting = mine.filter((t) => status(t) === "Waiting").length;
    const active = mine.filter((t) => ["In Progress", "Revision", "Need Approval", "Todo"].includes(status(t))).length;
    return {
      name, role: PERSON_ROLE[name], color: PERSON_COLOR[name],
      total: mine.length, done, active, waiting, stuck,
      needsAttention: stuck > 0 || waiting > 1,
    };
  });
}
