import {
  Target, CalendarDays, Palette, Star,
  Wallet, CheckSquare, Users, Settings, Inbox, ClipboardCheck, FolderOpen,
  CalendarClock, Globe, BarChart3, Receipt, Sparkles,
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
      // route now redirects to Campaign Café, which is the real front door.
      { href: "/campaigns", label: "Campaign Café", icon: Target, ready: true },
      { href: "/workflow", label: "Team Calendar", icon: CalendarClock, ready: true },
    ],
  },
  {
    label: "Plan & Produce",
    items: [
      { href: "/content", label: "Content Plan", icon: CalendarDays, ready: true },
      { href: "/graphic", label: "Creative Kitchen", icon: Palette, ready: true },
      { href: "/kol", label: "KOL/Influ Café", icon: Star, ready: true },
      { href: "/requests", label: "Brief & Bite", icon: Inbox, ready: false },
      { href: "/approvals", label: "Ready to Serve", icon: ClipboardCheck, ready: false },
      { href: "/assets", label: "Asset Pantry", icon: FolderOpen, ready: true },
      { href: "/expenses", label: "Cashier", icon: Receipt, ready: true },
      { href: "/finance", label: "Finance Counter", icon: Wallet, ready: true },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/my-tasks", label: "Busy but Brilliant", icon: CheckSquare, ready: true },
      { href: "/team", label: "Team Mood Board", icon: Users, ready: true },
      { href: "/settings", label: "Settings", icon: Settings, ready: true },
    ],
  },
  {
    label: "QC",
    items: [
      { href: "/platforms", label: "Performance Bar", icon: BarChart3, ready: true },
      { href: "/performance-center", label: "Performance Center", icon: Sparkles, ready: true },
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
