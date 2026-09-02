"use client";

// Who is waiting on whom, everywhere in the app — asked once.
//
// These questions used to live inline in /my-tasks. They moved out the moment a
// second screen (/my-approvals) had to ask them: two copies of "does this
// campaign wait on me" is how a badge saying 3 ends up above a list showing 1.
// The hook takes data it does not fetch, so the page that already holds these
// rows for other reasons (My Tasks) does not load them twice.
//
// It answers the gate questions — who this person is, what their role lets them
// decide, which brands they may see — and hands them to buildApprovalRows,
// which owns the rules. Nothing here filters by person: the queue holds the
// whole team's open decisions and marks which are yours (row.mine).

import { useMemo } from "react";
import { ApprovalRow, buildApprovalRows } from "@/lib/data/approvals";
import { BRANDS, BrandId } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useAuth } from "@/lib/auth";
import { useCreativeLeader, useCmoName, useCiBackup } from "@/lib/useCreativeLeader";
import { useBrandMarketer } from "@/lib/useBrandMarketer";
import { useCanApproveExpense, useCanSeeAllSpending } from "@/lib/usePermGates";
import { canApproveCampaign, canEditContentPlan } from "@/lib/roleGates";
import { personKeys, memberRef } from "@/lib/identity";
import { CampaignRow } from "@/lib/data/campaigns";
import { ContentItem } from "@/lib/data/content";
import { RequestRow } from "@/lib/data/requests";
import { Task } from "@/lib/data/tasks";
import { Graphic } from "@/lib/data/graphic";
import type { ExpenseReq } from "@/lib/db/finance";

export interface ApprovalInput {
  campaigns: CampaignRow[];
  requests: RequestRow[];
  expenseReqs: ExpenseReq[];
  graphics: Graphic[];
  posts: ContentItem[];
  tasks: Task[];
  doneIds: Set<number>;
  /** The name the page is showing as — the fallback identity before the member
   *  row lands, so the gates do not all answer false and read as "nothing is
   *  yours" when the truth is "we do not know who you are yet". */
  viewAs: string;
}

export function useApprovalRows(input: ApprovalInput): ApprovalRow[] {
  const { campaigns, requests, expenseReqs, graphics, posts, tasks, doneIds, viewAs } = input;
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  // Expense approvals are a role gate, not a person filter. Read it from the
  // same permissions matrix the database checks (Finance >= Approve) rather
  // than string-matching "CMO" here.
  const canApproveExpense = useCanApproveExpense();
  // Seeing the money lane at all is its own line — everything else in this
  // queue is open to the whole team, amounts are not. Same gate the Spending
  // Log uses (Finance ≥ View).
  const canSeeSpending = useCanSeeAllSpending();
  // From useAuth, NOT useRole: useRole is the sidebar's "Viewing as" switcher,
  // which anyone can set to CMO. The Approve button on the campaign page reads
  // useAuth().role, so trusting the switcher here would hand a designer buttons
  // the page behind them refuses — and the database refuses too.
  const { member, user, role: authRole } = useAuth();
  const myKeys = useMemo(() => {
    const keys = personKeys(memberRef(member), user);
    return keys.size ? keys : personKeys({ name: viewAs });
  }, [member, user, viewAs]);

  // Tasks carry a brand LABEL, not a BrandId, so they get their own visibility
  // test. "All brands" and a blank label are visible to everyone.
  const canSeeBrandLabel = useMemo(() => (value?: string | null) => {
    if (brandVisibility.allowAll) return true;
    const raw = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!raw || raw === "allbrands") return true;
    return brandOptions.some((id) => raw.includes(id) || raw.includes(BRANDS[id].name.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  }, [brandVisibility, brandOptions]);

  // Named, not role-labelled: an artwork row has to say who to chase, and when
  // the lens owner is barred from their own lens it has to name the stand-in.
  const creativeLeader = useCreativeLeader();
  const cmoName = useCmoName();
  const ciBackup = useCiBackup();
  // Captions are addressed by brand — see captionReviewer.
  const brandMarketer = useBrandMarketer();

  const ctx = useMemo(() => ({
    myKeys, me: member?.name || viewAs, role: authRole,
    creativeLeader, cmoName, ciBackup,
    canApproveCampaign: canApproveCampaign(authRole),
    canApproveExpense,
    canSeeSpending,
    canEditContentPlan: canEditContentPlan(authRole),
    isVisible: (b: BrandId) => brandVisibility.isVisible(b),
    brandMarketer,
    canSeeBrandLabel,
    doneIds,
  }), [myKeys, member, viewAs, authRole, creativeLeader, cmoName, ciBackup, brandMarketer, canApproveExpense, canSeeSpending, brandVisibility, canSeeBrandLabel, doneIds]);

  return useMemo(
    () => buildApprovalRows({
      captions: posts, graphics, campaigns, requests, expenses: expenseReqs, kol: tasks,
    }, ctx),
    [posts, graphics, campaigns, requests, expenseReqs, tasks, ctx],
  );
}
