import {
  LayoutDashboard, Target, CalendarDays, Palette, Star,
  Wallet, CheckSquare, Users, Settings, Inbox, ClipboardCheck, FolderOpen,
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
      { href: "/", label: "Dashboard", icon: LayoutDashboard, ready: true },
      { href: "/campaigns", label: "Campaigns", icon: Target, ready: true },
      { href: "/finance", label: "Finance", icon: Wallet, ready: true },
    ],
  },
  {
    label: "Plan & Produce",
    items: [
      { href: "/content", label: "Content Calendar", icon: CalendarDays, ready: true },
      { href: "/graphic", label: "Graphic Request", icon: Palette, ready: true },
      { href: "/kol", label: "KOL / Creator", icon: Star, ready: true },
      { href: "/requests", label: "Request Center", icon: Inbox },
      { href: "/approvals", label: "Approval Queue", icon: ClipboardCheck },
      { href: "/assets", label: "Asset Library", icon: FolderOpen },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/my-tasks", label: "My Tasks", icon: CheckSquare, badge: 4, ready: true },
      { href: "/team", label: "Team Workload", icon: Users, ready: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
