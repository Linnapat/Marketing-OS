import {
  LayoutDashboard, Target, CalendarDays, Palette, Star,
  Wallet, CheckSquare, Users, Settings, Inbox, ClipboardCheck, FolderOpen,
  CalendarClock, Globe, Megaphone, Receipt,
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
      { href: "/", label: "Mood & Metrics", icon: LayoutDashboard, ready: true },
      { href: "/campaigns", label: "Campaign Café", icon: Target, ready: true },
    ],
  },
  {
    label: "Plan & Produce",
    items: [
      { href: "/content", label: "Content Bento", icon: CalendarDays, ready: true },
      { href: "/graphic", label: "Creative Kitchen", icon: Palette, ready: true },
      { href: "/kol", label: "Creator Café", icon: Star, ready: true },
      { href: "/ads", label: "The Daily Boost", icon: Megaphone, ready: false },
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
      { href: "/my-tasks", label: "Busy but Brilliant", icon: CheckSquare, badge: 4, ready: true },
      { href: "/team", label: "Team Mood Board", icon: Users, ready: true },
      { href: "/workflow", label: "Team Calendar", icon: CalendarClock, ready: true },
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
