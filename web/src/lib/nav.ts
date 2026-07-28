import {
  Target, CalendarDays, Palette, Star,
  Wallet, CheckSquare, Users, Settings, Inbox, FolderOpen,
  CalendarClock, Globe, BarChart3, Receipt, Sparkles, LayoutList, Gauge,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Built in this session; others render a Coming-soon placeholder. */
  ready?: boolean;
  badge?: number;
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
      { href: "/platforms", label: "Platform Performance", icon: BarChart3, ready: true },
      { href: "/performance-center", label: "Performance Center", icon: Sparkles, ready: false },
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
      { href: "/kol", label: "KOL", icon: Star, ready: true },
      { href: "/requests", label: "Requests", icon: Inbox, ready: false },
      { href: "/assets", label: "Assets", icon: FolderOpen, ready: true },
      { href: "/expenses", label: "Expenses", icon: Receipt, ready: true },
      { href: "/finance", label: "Finance", icon: Wallet, ready: true },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/my-tasks", label: "My Tasks", icon: CheckSquare, ready: true },
      { href: "/team", label: "Team", icon: Users, ready: true },
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
