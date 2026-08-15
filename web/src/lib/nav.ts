import {
  Target, CalendarDays, Palette, Star,
  Wallet, CheckSquare, Users, Settings, Inbox, FolderOpen,
  CalendarClock, Globe, BarChart3, Receipt, Sparkles, LayoutList, Gauge, Trash2, ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Built in this session; others render a Coming-soon placeholder. */
  ready?: boolean;
  badge?: number;
  /** Deep-links to a tab within `href`. Permissions and accent colours still
   *  resolve from the plain href, so a tabbed page stays one module. */
  tab?: string;
  /** Only the campaign approver sees it on their rail. Tidying, not security —
   *  the page itself decides who may act (see roleGates.canApproveCampaign). */
  cmoOnly?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      // Mood & Metrics (the "/" dashboard) closed per CMO, 18 Jul 2026 — the
      // route now redirects to Campaigns, which is the real front door.
      { href: "/campaigns", label: "Campaigns", icon: Target, ready: true },
      { href: "/workflow", label: "Team Calendar", icon: CalendarClock, ready: true },
    ],
  },
  {
    label: "QA",
    items: [
      { href: "/status", label: "Status Board", icon: LayoutList, ready: true },
      // The weekly pass over edits made to campaigns that were already approved.
      // Nobody is blocked by what is in here, so it sits with the QA screens
      // rather than in front of the planning work.
      { href: "/campaigns/approvals", label: "Approvals", icon: ClipboardCheck, ready: true, cmoOnly: true },
      { href: "/platforms", label: "Platform Performance", icon: BarChart3, ready: true },
      { href: "/performance-center", label: "Performance Center", icon: Sparkles, ready: true },
      // Lives under Performance Center as a route, but it is the monthly people
      // review — surfaced here per CMO so it isn't two clicks deep behind a tab.
      { href: "/performance-center/team-kpi", label: "Team KPI", icon: Gauge, ready: true },
    ],
  },
  {
    label: "Plan & Produce",
    items: [
      { href: "/content", label: "Content Plan", icon: CalendarDays, ready: true },
      { href: "/graphic", label: "Graphic Request", icon: Palette, ready: true },
      { href: "/requests", label: "Requests", icon: Inbox, ready: false },
      { href: "/assets", label: "Assets", icon: FolderOpen, ready: true },
      { href: "/expenses", label: "Expenses", icon: Receipt, ready: true },
      { href: "/finance", label: "Finance", icon: Wallet, ready: true },
    ],
  },
  {
    // Its own heading rather than one line under Plan & Produce: KOL is four
    // distinct jobs (request, plan, results, roster) and burying them behind a
    // tab strip meant the roster in particular was never opened.
    label: "KOL",
    items: [
      { href: "/kol", tab: "list", label: "Request List", icon: Inbox, ready: true },
      { href: "/kol", tab: "plan", label: "KOL Plan", icon: CalendarDays, ready: true },
      { href: "/kol", tab: "performance", label: "Performance", icon: BarChart3, ready: true },
      { href: "/kol", tab: "database", label: "KOL Library", icon: Star, ready: true },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/my-tasks", label: "My Tasks", icon: CheckSquare, ready: true },
      { href: "/team", label: "Team", icon: Users, ready: true },
      { href: "/trash", label: "Trash", icon: Trash2, ready: true },
      { href: "/settings", label: "Settings", icon: Settings, ready: true },
    ],
  },
  {
    label: "External",
    items: [
      { href: "/agency", label: "Agency Portal", icon: Globe, ready: true },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
