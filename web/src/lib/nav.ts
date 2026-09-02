import {
  Target, CalendarDays, Palette, Star,
  Wallet, CheckSquare, Users, Settings, Inbox, FolderOpen,
  CalendarClock, Globe, BarChart3, Receipt, Sparkles, LayoutList, Gauge, Trash2, ClipboardCheck,
  FileText, Video,
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
      // Off the rail for a few hours on 26 Aug 2026 and put straight back (CMO):
      // it overlaps the Content Plan calendar and the Shoot Schedule, but the
      // team reads the month here. Leave it.
      { href: "/workflow", label: "Team Calendar", icon: CalendarClock, ready: true },
    ],
  },
  {
    label: "QA",
    items: [
      { href: "/status", label: "Status Board", icon: LayoutList, ready: true },
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
    // Above KOL, under Plan & Produce (per CMO, 2 Sep 2026). It sat below KOL
    // on the reasoning that approving is the last step of producing — true of
    // the work, not of the day: the people who live here open the lanes first
    // thing and several times over, while KOL is a weekly stop. The rail is
    // ordered by how often it is reached for. Still its own heading — it was
    // invisible for months as a chip inside somebody else's task board. (Path
    // is /approval-center, not /approvals — that one is a permanent redirect,
    // see next.config.mjs.)
    label: "Approval",
    items: [
      // Three lanes, no combined "Approval Center" entry above them (dropped
      // per CMO, 26 Aug 2026): the all-lanes view held captions, artwork and
      // video in one scroll and nobody read it that way — people come here for
      // one kind of decision at a time. Same page, one panel each (?tab=); the
      // Sidebar lights whichever ?tab= matches. The bare path still renders
      // every lane for the links that point at it (an expense approval has no
      // lane of its own) — it is simply not on the rail any more.
      { href: "/approval-center", tab: "caption", label: "Caption", icon: FileText, ready: true },
      { href: "/approval-center", tab: "artwork", label: "Artwork", icon: Palette, ready: true },
      { href: "/approval-center", tab: "vdo", label: "VDO", icon: Video, ready: true },
      { href: "/campaigns/approvals", label: "อนุมัติย้อนหลัง", icon: ClipboardCheck, ready: true, cmoOnly: true },
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
