"use client";

// Approval Center — the module that owns every decision the team has open.
//
// It began as a filter chip inside /my-tasks ("My approvals"), and that is
// where it kept getting stuck: a personal task board and a queue of decisions
// are two different jobs, and nobody opens someone else's board looking for
// their own sign-offs. So captions, artwork and storyboards aged behind a tab
// that only the people who already knew about it ever pressed. It is a module
// now, with its own place in the rail — and My Tasks links here rather than
// keeping a copy, because two screens showing the same queue is how they start
// disagreeing about what is open.
//
// Lanes, not one "Graphic" pile: Caption, Artwork and VDO each hold a lane
// whether or not they have work today. VDO spent a long time folded into
// "Graphic work" even though workKind() has classified it separately since it
// existed, and a lane that vanishes on a quiet week is how it gets folded back.
//
// The path is /approval-center rather than /approvals: that one is a PERMANENT
// (308) redirect to the Status Board in next.config.mjs, cached by every
// browser that ever followed it, and nothing we deploy clears it from their
// disk. See APPROVAL_CENTER in lib/deepLink.

import { Suspense, useEffect, useState } from "react";
import { CampaignPageHeaderSection } from "@/components/campaign/CampaignHeadController";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ApprovalInbox } from "@/components/approvals/ApprovalInbox";
import { ApprovalKind, APPROVAL_META } from "@/lib/data/approvals";
import { APPROVAL_CENTER, OPEN_PARAM } from "@/lib/deepLink";

/** Lanes that have their own entry on the rail. Anything else in the query is
 *  ignored rather than rendering an empty page for a typo'd link. */
const RAIL_LANES = ["caption", "artwork", "vdo"] as const;

export default function ApprovalCenterPage() {
  return (
    <Suspense fallback={<div className="px-5 py-10 text-[13px] text-faint">Loading…</div>}>
      <ApprovalCenterInner />
    </Suspense>
  );
}

function ApprovalCenterInner() {
  // Which lane the rail asked for. Caption / Artwork / VDO are their own
  // entries and all three share this pathname, so the query is the only thing
  // that changes and the page never remounts — first paint reads the URL, and
  // the sidebar tells us directly after that (same contract /kol uses; see
  // Sidebar's nav:tab dispatch).
  const [lane, setLane] = useState<ApprovalKind | null>(null);
  useEffect(() => {
    const read = (value: string | null) =>
      setLane(value && (RAIL_LANES as readonly string[]).includes(value) ? value as ApprovalKind : null);
    read(new URLSearchParams(window.location.search).get(OPEN_PARAM.tab));
    const onNavTab = (e: Event) => {
      const detail = (e as CustomEvent<{ href?: string; tab?: string }>).detail;
      if (detail?.href === APPROVAL_CENTER) read(detail.tab ?? null);
    };
    const onPop = () => read(new URLSearchParams(window.location.search).get(OPEN_PARAM.tab));
    window.addEventListener("nav:tab", onNavTab);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("nav:tab", onNavTab);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  return (
    <div style={{ paddingBottom: 40 }}>
      <CampaignPageHeaderSection
        eyebrow={lane ? `APPROVAL · ${APPROVAL_META[lane].label.toUpperCase()}` : "APPROVAL CENTER"}
        title={lane ? `รออนุมัติ · ${APPROVAL_META[lane].label}` : "ศูนย์อนุมัติงาน"}
        description="ทุกงานที่ยังรออนุมัติ เรียงตามงานที่รอนานที่สุด · เห็นงานทั้งทีมได้ กดได้เฉพาะที่เป็นของคุณ · ยกเว้นเรื่องเงิน ที่เห็นเฉพาะสายการเงิน"
        right={<NotificationBell tone="light" />}
      />

      <div className="mt-5">
        <ApprovalInbox only={lane} />
      </div>
    </div>
  );
}
