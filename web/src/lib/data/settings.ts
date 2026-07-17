// Settings — ported from Settings.dc.html. Sidebar + content panel across 11 sections.

export interface NavGroup { group: string; items: { id: string; icon: string; label: string }[]; }
export const NAV_DEF: NavGroup[] = [
  { group: "General", items: [{ id: "org", icon: "🏢", label: "Organization" }] },
  { group: "Structure", items: [{ id: "brands", icon: "🎨", label: "Brands & Branches" }, { id: "campaign-types", icon: "🎯", label: "Campaign Types" }, { id: "teams", icon: "👥", label: "Teams" }, { id: "users", icon: "👤", label: "Users & Roles" }] },
  { group: "Rules", items: [{ id: "perms", icon: "🔐", label: "Permissions" }, { id: "approval", icon: "✅", label: "Approval Matrix" }, { id: "workflow", icon: "🔄", label: "Workflow Status" }] },
  { group: "Communication", items: [{ id: "notifs", icon: "🔔", label: "Notifications" }, { id: "integrations", icon: "🔌", label: "Integrations" }] },
  { group: "Resources", items: [{ id: "templates", icon: "📋", label: "Templates" }, { id: "audit", icon: "📝", label: "Audit Log" }] },
];

export const SECTION_META: Record<string, { title: string; desc: string }> = {
  org: { title: "Organization", desc: "Company details, timezone, currency, and fiscal year settings." },
  brands: { title: "Brands & Branches", desc: "Configure brands, branch locations, and brand leads." },
  "campaign-types": { title: "Campaign Types", desc: "Add, rename, or remove the campaign types available in Campaign forms." },
  teams: { title: "Teams", desc: "Define team groups, responsibilities, and default owners." },
  users: { title: "Users & Roles", desc: "Manage team members, roles, and access scopes." },
  perms: { title: "Permissions", desc: "Role-based module access matrix." },
  approval: { title: "Approval Matrix", desc: "Configure approval rules by module, budget, and campaign type." },
  workflow: { title: "Workflow Status", desc: "Manage status options for each module." },
  notifs: { title: "Notifications", desc: "Configure channels and triggers for alerts." },
  integrations: { title: "Integrations", desc: "Connect external services and APIs." },
  templates: { title: "Templates", desc: "Manage brief and report templates for each module." },
  audit: { title: "Audit Log", desc: "Track all configuration changes." },
};

export const ORG_FIELDS = [
  { label: "Company name", value: "TEPPEN Group Co., Ltd." },
  { label: "Timezone", value: "Asia/Bangkok (UTC+7)" },
  { label: "Currency", value: "Thai Baht (฿ THB)" },
  { label: "VAT rate", value: "7% — included in total" },
  { label: "Fiscal year", value: "January — December 2026" },
  { label: "Working days", value: "Monday — Friday" },
  { label: "Working hours", value: "10:00 — 19:00" },
  { label: "Date format", value: "DD/MM/YYYY" },
];

export interface BrandCfg {
  key: string;
  name: string;
  color: string;
  lead: string;
  branches: number;
  campaigns: number;
  budget: string;
  branchList: string[];
}

export const BRANDS_DATA: BrandCfg[] = [
  { key: "teppen", name: "Teppen Thailand", color: "#B33A2E", lead: "Ken S.", branches: 3, campaigns: 8, budget: "฿1.8M", branchList: ["Central World", "EmQuartier", "Siam Paragon"] },
  { key: "omakase", name: "Omakase Don", color: "#3E5C9A", lead: "Aran P.", branches: 4, campaigns: 6, budget: "฿1.2M", branchList: ["IconSiam", "Centralplaza Westgate", "The Mall", "Terminal 21"] },
  { key: "mainichi", name: "Mainichi", color: "#4E7A4E", lead: "Nok W.", branches: 2, campaigns: 5, budget: "฿0.8M", branchList: ["Emporium", "Central Rama 9"] },
  { key: "touka", name: "Touka", color: "#C68A1E", lead: "Ploy R.", branches: 2, campaigns: 4, budget: "฿0.7M", branchList: ["Park Silom", "Gaysorn"] },
];

export const TEAMS_DATA = [
  { icon: "🎯", name: "Marketing Team", lead: "Ken S.", scope: "Campaign planning · brand management · store activation · CRM coordination", members: ["Ken S.", "Nok W.", "May T."] },
  { icon: "🎨", name: "Creative Team", lead: "Boss", scope: "Graphic request · artwork · video editing · final delivery", members: ["Boss", "Aom V."] },
  { icon: "🧩", name: "Operations / Co-ordination", lead: "Nok W.", scope: "Timeline follow-up · cross-team coordination · branch follow-through", members: ["Nok W."] },
  { icon: "🌟", name: "KOL / Creator Team", lead: "Ploy R.", scope: "KOL sourcing · creator brief · review · result tracking", members: ["Ploy R.", "Mint C."] },
  { icon: "✅", name: "Management", lead: "Aran P.", scope: "CMO approval · final review · org-level decisions", members: ["Aran P."] },
  { icon: "🤝", name: "Agency / External", lead: "Mild A.", scope: "External creative / content support by assigned brand", members: ["Mild A."] },
];

export const USERS_DATA = [
  { name: "Khun Aran", email: "aran@teppenthailand.co.th", role: "CMO", access: "Admin", brandAccess: "All brands", status: "Active", color: "#B8945A" },
  { name: "Ken S.", email: "ken@teppenthailand.co.th", role: "Marketing Manager / BGL", access: "Editor", brandAccess: "Teppen · Omakase Don", status: "Active", color: "#3E5C9A" },
  { name: "Boss", email: "boss@teppenthailand.co.th", role: "Creative Leader", access: "Editor", brandAccess: "All brands", status: "Active", color: "#4E7A4E" },
  { name: "Nok W.", email: "nok@teppenthailand.co.th", role: "Marketing Executive", access: "Editor", brandAccess: "Mainichi · Touka", status: "Active", color: "#6b6258" },
  { name: "Ploy R.", email: "ploy@teppenthailand.co.th", role: "KOL Specialist", access: "Editor", brandAccess: "Touka", status: "Active", color: "#B5577E" },
  { name: "May T.", email: "may@teppenthailand.co.th", role: "Co-ordinator", access: "Editor", brandAccess: "Teppen · Mainichi", status: "Active", color: "#C2691E" },
  // An outsourced studio — the Agency Portal only shows requests assigned to an
  // external member, so the demo needs one or that whole module looks empty.
  { name: "Studio Nine", email: "hello@studionine.co", role: "Agency (External)", access: "Viewer", brandAccess: "External only", status: "Active", color: "#7A6BA8" },
];

export const MEMBER_PRESENCE_OPTIONS = [
  { label: "Available", emoji: "🟢" },
  { label: "Heads down", emoji: "🎯" },
  { label: "In meeting", emoji: "📅" },
  { label: "WFH", emoji: "🏠" },
  { label: "On leave", emoji: "🌴" },
];

export const PERM_MODULES = ["Campaign", "Graphic", "KOL", "Finance", "Content", "CRM", "Settings"];
export interface Perm { l: string; c: string; b: string; }
const A: Perm = { l: "Admin", c: "#B8945A", b: "#FBF6ED" };
const AP: Perm = { l: "Approve", c: "#4E7A4E", b: "#EEF4EE" };
const E: Perm = { l: "Edit", c: "#3E5C9A", b: "#EEF1F8" };
const V: Perm = { l: "View", c: "#9A9387", b: "#F2F0EB" };
const N: Perm = { l: "—", c: "#C0B8AD", b: "#F2F0EB" };
// Data scope a role can see/act on: whole org, a brand, a single branch, or
// only their own records.
export type PermScope = "All" | "Brand" | "Branch" | "Own";
export const PERM_SCOPE_META: Record<PermScope, { label: string; c: string; b: string }> = {
  All: { label: "All brands", c: "#B8945A", b: "#FBF6ED" },
  Brand: { label: "Brand", c: "#3E5C9A", b: "#EEF1F8" },
  Branch: { label: "Branch", c: "#4E7A4E", b: "#EEF4EE" },
  Own: { label: "Own only", c: "#9A9387", b: "#F2F0EB" },
};
export const PERM_ROLES: { role: string; desc: string; scope: PermScope; perms: Perm[] }[] = [
  { role: "CMO", desc: "Full access", scope: "All", perms: [A, A, A, A, A, A, A] },
  { role: "Marketing Manager / BGL", desc: "Brand lead · review & approve", scope: "Brand", perms: [AP, AP, AP, V, AP, AP, N] },
  { role: "Creative Leader", desc: "Creative planning & final review", scope: "Brand", perms: [V, AP, N, N, V, N, N] },
  { role: "Marketing Executive", desc: "Create & follow through campaign work", scope: "Brand", perms: [E, V, V, N, E, E, N] },
  { role: "Senior Graphic Designer", desc: "Graphic / artwork execution", scope: "Own", perms: [V, E, N, N, V, N, N] },
  { role: "VDO Editor", desc: "Video production execution", scope: "Own", perms: [V, E, N, N, V, N, N] },
  { role: "Co-ordinator", desc: "Cross-team co-ordination and tracking", scope: "Brand", perms: [V, V, V, N, V, V, N] },
  { role: "KOL Specialist", desc: "KOL module", scope: "Own", perms: [V, N, E, N, V, N, N] },
  { role: "Content Creator", desc: "Content creation & copywriting", scope: "Own", perms: [V, N, N, N, E, E, N] },
  { role: "Agency (External)", desc: "External — task list only", scope: "Own", perms: [N, E, N, N, E, N, N] },
];

// Selectable positions when inviting a member. Each role carries a default
// access level and brand scope so picking a role opens/closes what they can
// view or edit — an admin can still fine-tune per-role rights in Permissions.
export const ROLE_OPTIONS: { role: string; access: "Admin" | "Editor" | "Viewer"; brand: string; external?: boolean }[] = [
  { role: "CMO", access: "Admin", brand: "All brands" },
  { role: "Marketing Manager / BGL", access: "Editor", brand: "All brands" },
  { role: "Creative Leader", access: "Editor", brand: "All brands" },
  { role: "Marketing Executive", access: "Editor", brand: "Selected brands" },
  { role: "Senior Graphic Designer", access: "Editor", brand: "All brands" },
  { role: "VDO Editor", access: "Editor", brand: "All brands" },
  { role: "Co-ordinator", access: "Editor", brand: "Selected brands" },
  { role: "KOL Specialist", access: "Editor", brand: "Selected brands" },
  { role: "Content Creator", access: "Editor", brand: "Selected brands" },
  { role: "Agency (External)", access: "Editor", brand: "External only", external: true },
];

export const BUDGET_THRESHOLDS = [
  { range: "฿0 – 10,000", approver: "Marketing Manager / BGL only", chain: ["Marketing Manager / BGL"] },
  { range: "฿10,001 – 50,000", approver: "CMO approval", chain: ["Marketing Manager / BGL", "CMO"] },
  { range: "฿50,001 – 200,000", approver: "CMO + CFO", chain: ["Marketing Manager / BGL", "CMO", "CFO"] },
  { range: "฿200,001+", approver: "CMO + CFO + CEO", chain: ["CMO", "CFO", "CEO"] },
];

export const APPROVAL_RULES = [
  { icon: "🎯", module: "Campaign", sla: 3, escalate: 4, remind: 2, backup: "Aran P.", chain: ["Marketing Manager / BGL", "CMO"] },
  { icon: "🎨", module: "Graphic Request", sla: 2, escalate: 4, remind: 1, backup: "Boss", chain: ["Requester", "Creative Leader", "Marketing Manager / BGL", "CMO"] },
  { icon: "🌟", module: "KOL / Creator", sla: 3, escalate: 5, remind: 2, backup: "Ploy R.", chain: ["Marketing Manager / BGL", "CMO"] },
  { icon: "✍️", module: "Content", sla: 2, escalate: 3, remind: 1, backup: "Ken S.", chain: ["Marketing Manager / BGL", "CMO"] },
  { icon: "฿", module: "Finance / Budget", sla: 3, escalate: 4, remind: 2, backup: "Aran P.", chain: ["Marketing Manager / BGL", "CMO", "CFO"] },
];

export type WfModule = "campaign" | "graphic" | "kol" | "task";
export const WF_MODULE_LABELS: Record<WfModule, string> = { campaign: "Campaign", graphic: "Graphic", kol: "KOL", task: "Task" };
export interface WfStatus { order: number; name: string; color: string; type: string; }
export const STATUS_SETS: Record<WfModule, WfStatus[]> = {
  campaign: [{ order: 1, name: "Draft", color: "#9A9387", type: "Active" }, { order: 2, name: "Planning", color: "#3E5C9A", type: "Active" }, { order: 3, name: "Waiting Approval", color: "#C68A1E", type: "Waiting" }, { order: 4, name: "Approved", color: "#4E7A4E", type: "Active" }, { order: 5, name: "In Execution", color: "#3E5C9A", type: "Active" }, { order: 6, name: "Completed", color: "#4E7A4E", type: "Done" }, { order: 7, name: "On Hold", color: "#C68A1E", type: "Waiting" }, { order: 8, name: "Cancelled", color: "#B33A2E", type: "Cancelled" }],
  graphic: [{ order: 1, name: "New Request", color: "#9A9387", type: "Active" }, { order: 2, name: "In Progress", color: "#3E5C9A", type: "Active" }, { order: 3, name: "Waiting Feedback", color: "#C68A1E", type: "Waiting" }, { order: 4, name: "Revision", color: "#C2691E", type: "Active" }, { order: 5, name: "Waiting Approval", color: "#C68A1E", type: "Waiting" }, { order: 6, name: "Approved", color: "#4E7A4E", type: "Done" }, { order: 7, name: "Delivered", color: "#4E7A4E", type: "Done" }, { order: 8, name: "Cancelled", color: "#B33A2E", type: "Cancelled" }],
  kol: [{ order: 1, name: "Prospect", color: "#9A9387", type: "Active" }, { order: 2, name: "Negotiating", color: "#C68A1E", type: "Active" }, { order: 3, name: "Contract Signed", color: "#4E7A4E", type: "Active" }, { order: 4, name: "Brief Sent", color: "#3E5C9A", type: "Active" }, { order: 5, name: "Content Creating", color: "#B5577E", type: "Active" }, { order: 6, name: "Draft Submitted", color: "#C68A1E", type: "Waiting" }, { order: 7, name: "Approved to Post", color: "#4E7A4E", type: "Active" }, { order: 8, name: "Completed", color: "#4E7A4E", type: "Done" }],
  task: [{ order: 1, name: "Todo", color: "#9A9387", type: "Active" }, { order: 2, name: "In Progress", color: "#3E5C9A", type: "Active" }, { order: 3, name: "Waiting", color: "#C68A1E", type: "Waiting" }, { order: 4, name: "Stuck", color: "#B33A2E", type: "Waiting" }, { order: 5, name: "Need Approval", color: "#4E7A4E", type: "Waiting" }, { order: 6, name: "Revision", color: "#C2691E", type: "Active" }, { order: 7, name: "Done", color: "#4E7A4E", type: "Done" }, { order: 8, name: "Cancelled", color: "#B33A2E", type: "Cancelled" }],
};

export const NOTIF_CHANNELS = [
  { icon: "💬", label: "LINE Notify", desc: "Push to LINE group", key: "line", def: true },
  { icon: "📧", label: "Email", desc: "Daily digest + alerts", key: "email", def: true },
  { icon: "💼", label: "Slack", desc: "Team channel alerts", key: "slack", def: false },
  { icon: "💬", label: "Google Chat", desc: "Future state", key: "gchat", def: false },
];
export const NOTIF_TRIGGERS = [
  { trigger: "New task assigned", desc: "Notify when task is created and assigned", channels: ["LINE", "Email"], timing: "Immediately", key: "newTask", def: true },
  { trigger: "Approval request", desc: "Approval waiting for your action", channels: ["LINE", "Email"], timing: "Immediately", key: "approval", def: true },
  { trigger: "Comment mention", desc: "Someone mentioned you in a comment", channels: ["LINE"], timing: "Immediately", key: "mention", def: true },
  { trigger: "Task due soon", desc: "24h before deadline", channels: ["Email"], timing: "24h before", key: "due", def: true },
  { trigger: "Task overdue", desc: "When due date has passed", channels: ["LINE", "Email"], timing: "08:00 daily", key: "overdue", def: true },
  { trigger: "Graphic waiting feedback", desc: "Asset waiting review >2 days", channels: ["LINE"], timing: "Daily", key: "feedback", def: true },
  { trigger: "Campaign launching soon", desc: "48h before campaign live date", channels: ["Email"], timing: "48h before", key: "launch", def: false },
  { trigger: "KOL missing post link", desc: "KOL has posted but no link added", channels: ["LINE"], timing: "Daily", key: "kol", def: true },
];

export const INTEGRATIONS = [
  { icon: "📁", iconBg: "#EEF1F8", name: "Google Drive", category: "Storage", desc: "Link brief, asset, and result files directly from Drive.", status: "Connected", lastSync: "2 hours ago", actions: ["Reconnect", "Disconnect"] },
  { icon: "📊", iconBg: "#EEF4EE", name: "Google Sheets", category: "Data", desc: "Sync campaign result data and budget tracking.", status: "Connected", lastSync: "1 day ago", actions: ["Sync now", "Disconnect"] },
  { icon: "💼", iconBg: "#EEF1F8", name: "Slack", category: "Messaging", desc: "Send task and approval alerts to your team channels.", status: "Not connected", lastSync: "—", actions: ["Connect"] },
  { icon: "💬", iconBg: "#EEF4EE", name: "LINE OA", category: "CRM / OA", desc: "Connected to LINE Official Account for CRM campaigns.", status: "Connected", lastSync: "30 min ago", actions: ["Test", "Disconnect"] },
  { icon: "⚙️", iconBg: "#FBF6ED", name: "Make.com", category: "Automation", desc: "Trigger workflows from campaign and approval events.", status: "Not connected", lastSync: "—", actions: ["Connect"] },
  { icon: "📘", iconBg: "#EEF1F8", name: "Meta / Instagram", category: "Publishing", desc: "Future: auto-publish posts via Meta API.", status: "Coming soon", lastSync: "—", actions: ["Learn more"] },
];

export const TEMPLATES = [
  { name: "Campaign Brief", desc: "Standard campaign planning form", module: "Campaign", updated: "Jun 28, 2026", status: "Active" },
  { name: "Graphic Request", desc: "Full brief + asset spec form", module: "Graphic", updated: "Jun 25, 2026", status: "Active" },
  { name: "KOL Brief", desc: "Creator brief with deliverables", module: "KOL", updated: "Jun 20, 2026", status: "Active" },
  { name: "Content Caption", desc: "Caption + copy template by platform", module: "Content", updated: "Jun 15, 2026", status: "Active" },
  { name: "CRM Campaign", desc: "LINE coupon and revisit template", module: "CRM", updated: "Jun 10, 2026", status: "Active" },
  { name: "Result Report", desc: "Monthly result summary template", module: "Campaign", updated: "May 30, 2026", status: "Active" },
  { name: "Approval Route", desc: "Custom approval chain template", module: "Settings", updated: "May 20, 2026", status: "Draft" },
];

export const AUDIT_LOG = [
  { time: "Jul 2  14:32", action: "Permission updated", user: "Aran P.", module: "Permissions", before: "Viewer → Editor", after: "Mei T. now Editor" },
  { time: "Jul 2  11:15", action: "Approval rule edited", user: "Aran P.", module: "Approval", before: "SLA 5 days", after: "SLA 3 days" },
  { time: "Jul 1  16:40", action: "Brand added", user: "Aran P.", module: "Brands", before: "3 brands", after: "4 brands (Touka)" },
  { time: "Jul 1  10:22", action: "User invited", user: "Ken S.", module: "Users", before: "5 members", after: "6 members (Mei T.)" },
  { time: "Jun 30 15:10", action: "Status renamed", user: "Aran P.", module: "Workflow", before: "\"Blocked\" status", after: "\"Stuck\"" },
  { time: "Jun 28 09:55", action: "Notification enabled", user: "Ken S.", module: "Notifications", before: "OFF", after: "KOL missing link ON" },
  { time: "Jun 25 14:00", action: "Google Drive connected", user: "Aran P.", module: "Integrations", before: "Not connected", after: "Connected" },
  { time: "Jun 20 11:30", action: "Template created", user: "Ploy R.", module: "Templates", before: "—", after: "KOL Brief template" },
];

export const TYPE_COLOR: Record<string, string> = {
  Campaign: "#B33A2E", Graphic: "#C2691E", KOL: "#B5577E", Finance: "#4E7A4E", Content: "#3E5C9A", Settings: "#B8945A", CRM: "#B8945A", Approval: "#4E7A4E", Brands: "#B33A2E", Users: "#3E5C9A", Workflow: "#C2691E", Notifications: "#C68A1E", Integrations: "#4E7A4E", Templates: "#B5577E", Permissions: "#B8945A",
};
