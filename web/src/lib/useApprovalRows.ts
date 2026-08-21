"use client";

// Who is waiting on you, everywhere in the app — asked once.
//
// These six questions used to live inline in /my-tasks. They moved here the
// moment a second screen (/my-approvals) had to ask them: two copies of "does
// this campaign wait on me" is how a badge saying 3 ends up above a list
// showing 1. The hook takes data it does not fetch, so the page that already
// holds these rows for other reasons (My Tasks) does not load them twice.

import { useMemo } from "react";
import { ApprovalRow, buildApprovalRows, selectGraphicApprovals } from "@/lib/data/approvals";
import { BRANDS, BrandId } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useAuth } from "@/lib/auth";
import { useCanApproveExpense } from "@/lib/usePermGates";
import { canApproveCampaign, canEditContentPlan } from "@/lib/roleGates";
import { personKeys, isSamePerson, memberRef } from "@/lib/identity";
import { CampaignRow, campaignAwaitsMe } from "@/lib/data/campaigns";
import { ContentItem, captionAwaitsApproval, captionOwner, captionReviewer } from "@/lib/data/content";
import { RequestRow } from "@/lib/data/requests";
import { Task } from "@/lib/data/tasks";
import { Graphic } from "@/lib/data/graphic";
import type { ExpenseReq } from "@/lib/db/finance";

/** Stages / statuses that still need someone in the approval tier to act. */
const PENDING_REQ_STAGES = new Set(["Submitted", "CMO Review", "Revision"]);

export interface ApprovalInput {
  campaigns: CampaignRow[];
  requests: RequestRow[];
  expenseReqs: ExpenseReq[];
  graphics: Graphic[];
  posts: ContentItem[];
  tasks: Task[];
  doneIds: Set<number>;
  /** The name the page is showing as — the fallback identity before the member
   *  row lands, so the filters do not all return nothing and read as "you have
   *  no work" when the truth is "we do not know who you are yet". */
  viewAs: string;
}

export function useApprovalRows(input: ApprovalInput): ApprovalRow[] {
  const { campaigns, requests, expenseReqs, graphics, posts, tasks, doneIds, viewAs } = input;
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  // Expense approvals are a role gate, not a person filter. Read it from the
  // same permissions matrix the database checks (Finance >= Approve) rather
  // than string-matching "CMO" here, so this queue and
  // supabase/security_p12_expense_approval.sql can never disagree about who
  // may decide a request.
  const canApproveExpense = useCanApproveExpense();
  // From useAuth, NOT useRole: useRole is the sidebar's "Viewing as" switcher,
  // which anyone can set to CMO. The Approve button on the campaign page reads
  // useAuth().role, so trusting the switcher here put Waiting-for-Approval
  // cards back in a designer's inbox — a dead end that also inflates the badge
  // everyone is meant to work down to zero.
  const { member, user, role: authRole } = useAuth();
  const myKeys = useMemo(() => {
    const keys = personKeys(memberRef(member), user);
    return keys.size ? keys : personKeys({ name: viewAs });
  }, [member, user, viewAs]);
  const canApproveCampaignBrief = canApproveCampaign(authRole);

  // Tasks carry a brand LABEL, not a BrandId, so they get their own visibility
  // test. "All brands" and a blank label are visible to everyone.
  const canSeeBrandLabel = useMemo(() => (value?: string | null) => {
    if (brandVisibility.allowAll) return true;
    const raw = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!raw || raw === "allbrands") return true;
    return brandOptions.some((id) => raw.includes(id) || raw.includes(BRANDS[id].name.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  }, [brandVisibility, brandOptions]);

  // Campaigns waiting on ME, not every campaign in flight. The two pending
  // statuses wait on different people:
  //   Waiting for Approval → the CMO decides
  //   Ready for Review     → nobody approves it; its owner still has to submit
  const approvalCampaigns = useMemo(
    () => campaigns.filter((c) =>
      brandVisibility.isVisible(c.b) && campaignAwaitsMe(c, { canApprove: canApproveCampaignBrief, me: viewAs })),
    [campaigns, brandVisibility, canApproveCampaignBrief, viewAs],
  );
  const approvalRequests = useMemo(
    // Budget cards are excluded — they're shown as actionable expense requests.
    () => requests.filter((r) => PENDING_REQ_STAGES.has(r.stage) && isSamePerson(r.approver, myKeys) && r.type !== "Budget" && brandVisibility.isVisible(r.b)),
    [requests, myKeys, brandVisibility],
  );
  const approvalExpenses = useMemo(
    () => (canApproveExpense ? expenseReqs.filter((r) => r.status === "Waiting Approval" && brandVisibility.isVisible(r.b)) : []),
    [expenseReqs, canApproveExpense, brandVisibility],
  );
  const approvalTasks = useMemo(
    () => tasks.filter((t) => isSamePerson(t.assignee, myKeys) && !doneIds.has(t.id) && t.status === "Need Approval" && canSeeBrandLabel(t.brand)),
    [tasks, myKeys, doneIds, canSeeBrandLabel],
  );
  const approvalGraphics = useMemo(
    () => selectGraphicApprovals(graphics, {
      myKeys, me: member?.name || viewAs, role: authRole,
      isVisible: (b: BrandId) => brandVisibility.isVisible(b),
    }),
    [graphics, myKeys, brandVisibility, authRole, member, viewAs],
  );
  // Captions waiting on the planning side. Addressed to the person who asked
  // for the post, not broadcast to everyone who could act on it: a caption
  // named for its requester goes to them alone, and only an unaddressed one
  // still falls back to the planning side, so nothing is stranded with no queue.
  const approvalCaptions = useMemo(
    () => posts.filter((p) => {
      if (!captionAwaitsApproval(p) || !brandVisibility.isVisible(p.b)) return false;
      // Nobody signs off their own words. captionOwner, not p.owner: on a post
      // still marked "Unassigned" the planner IS the writer, and reading the
      // raw field let them approve themselves.
      if (captionOwner(p).toLowerCase() === (member?.name ?? "").trim().toLowerCase()) return false;
      const reviewer = captionReviewer(p);
      return reviewer ? isSamePerson(reviewer, myKeys) : canEditContentPlan(authRole);
    }),
    [posts, authRole, brandVisibility, member, myKeys],
  );

  return useMemo(
    () => buildApprovalRows({
      captions: approvalCaptions, graphics: approvalGraphics, campaigns: approvalCampaigns,
      requests: approvalRequests, expenses: approvalExpenses, kol: approvalTasks,
    }),
    [approvalCaptions, approvalGraphics, approvalCampaigns, approvalRequests, approvalExpenses, approvalTasks],
  );
}
