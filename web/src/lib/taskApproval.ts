"use client";

// Saying yes to a task that stands for something else.
//
// A "Need Approval" task is usually a wrapper: approving it approves a KOL
// proposal, or applies a campaign's revised budget. That is why marking one
// done is not markDoneDb — it has to do the thing the task stands for FIRST,
// and only the caller that knows about approvalKind ever did.
//
// It lived inside My Tasks' markDone, which was fine until Approval Center
// started saying yes from a list row. Two copies means one of them eventually
// marks a task done without applying the budget behind it — a silent yes.

import { Task } from "@/lib/data/tasks";
import { markDoneDb } from "@/lib/db/tasks";
import { approveKolProposal } from "@/lib/db/kol";
import { updateCampaignBudget } from "@/lib/db/campaigns";
import { toastError } from "@/lib/toast";

/** Apply what the task stands for, then mark it done.
 *
 *  `onBudgetApplied` lets a page that is holding campaigns in state move the
 *  number without refetching; the write happens either way. */
export async function approveTask({ task, by, onBudgetApplied }: {
  task: Task;
  by: string;
  onBudgetApplied?: (campaignId: string, budget: number) => void;
}): Promise<void> {
  if (task.approvalKind === "kolProposal" && task.relatedKolId != null) {
    await approveKolProposal(task.relatedKolId, by || undefined)
      .catch((error) => toastError(`อนุมัติ KOL ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  }
  if (task.approvalKind === "budgetRevision" && task.relatedCampaignId && task.requestedBudget) {
    await updateCampaignBudget(task.relatedCampaignId, task.requestedBudget, by)
      .catch((error) => toastError(`ปรับ Budget ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    onBudgetApplied?.(task.relatedCampaignId, task.requestedBudget);
  }
  await markDoneDb(task.id)
    .catch((error) => toastError(`บันทึก Done ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
}
