// KOL workflow state machine — the single source of truth for which stage a
// creator can move to, what's required to enter each stage, and what the next
// action is. Pure functions (no I/O) so both the UI and the db layer enforce
// the SAME rules (never trust the disabled button alone).

import { Kol, ALL_STAGES, normalizeStage, kolPosts } from "@/lib/data/kol";

export const KOL_STAGES = ALL_STAGES; // Request → … → Completed

const idx = (stage: string) => KOL_STAGES.indexOf(normalizeStage(stage));

/** Does this KOL have at least one post/draft link? */
export function hasPostLink(k: Kol): boolean {
  return !!(k.postLink && k.postLink.trim()) || kolPosts(k).some((p) => p.link && p.link.trim());
}

/** Has a real owner (not blank / Unassigned)? */
export function hasOwner(k: Kol): boolean {
  const o = (k.owner || "").trim();
  return !!o && o.toLowerCase() !== "unassigned";
}

const contractSigned = (k: Kol) => /signed/i.test(k.contractStatus || "");
/** Reads the DERIVED status, not the stored word: a row whose stored status was
 *  overwritten by a re-submit is still approved, and one whose money moved past
 *  its approval is not — whatever the column says. */
const quotationApproved = (k: Kol) => /approved/i.test(quotationStateFor(k).status);
/** Approval passed = the KOL has reached (or moved past) the Approved stage. */
const approvalPassed = (k: Kol) => idx(k.status) >= idx("Approved");

/* ── The proposal approval is an approval OF AN AMOUNT ────────────────────
 *
 * Three live proposals sat on "Pending Approval" while carrying a full record
 * of having been approved — one of them approved three separate times, by name,
 * with the figure. What happened each time: someone pressed "Submit Profile &
 * Proposal" again after the approval (to fix a handle, a post date, a contact),
 * and that button unconditionally wrote quotationStatus back to "Pending
 * Approval". Worse, the task it would have raised is created only when there
 * ISN'T one already — so the second submit re-opened the approval and asked
 * nobody, and the deal could never come back on its own.
 *
 * The opposite hole ran alongside it: editing the budget of an APPROVED
 * proposal left it approved, with approvedAmount still on the old figure. A yes
 * for ฿15,414 quietly covering whatever number was typed next.
 *
 * Both come from treating "approved" as a flag on a row. It is not — it is a
 * yes to a NUMBER, and it survives exactly as long as that number does. */

/** What the deal commits today: fee + food support. totalCost is what the row
 *  stores, but older rows may not carry it, hence the sum as fallback. */
export function committedAmount(k: Pick<Kol, "totalCost" | "fee" | "foodCost">): number {
  return k.totalCost || (k.fee || 0) + (k.foodCost || 0);
}

/** Has anyone ever approved this proposal? Read from the evidence, not from the
 *  status word — the status is the thing that keeps getting overwritten. */
export function hasApprovalOnRecord(k: Pick<Kol, "approvedAt" | "approvedAmount">): boolean {
  return !!k.approvedAt || k.approvedAmount != null;
}

/** Does the recorded approval still cover what the deal now commits?
 *
 *  False when the money has moved since the yes — which is a real re-approval,
 *  not a formatting change. An approval with no amount recorded (older rows)
 *  counts as covering, because there is nothing to compare and inventing a
 *  mismatch would re-open deals nobody changed. */
export function approvalCoversAmount(k: Pick<Kol, "approvedAt" | "approvedAmount" | "totalCost" | "fee" | "foodCost">): boolean {
  if (!hasApprovalOnRecord(k)) return false;
  if (k.approvedAmount == null) return true;
  return committedAmount(k) === k.approvedAmount;
}

/** The quotation status a row should be showing, and whether the approval it
 *  carries has been outgrown. One rule, so the drawer, the re-submit and the
 *  budget box cannot each decide differently. */
export function quotationStateFor(
  k: Pick<Kol, "quotationStatus" | "approvedAt" | "approvedAmount" | "totalCost" | "fee" | "foodCost">,
): { status: string; needsReapproval: boolean } {
  if (!hasApprovalOnRecord(k)) return { status: k.quotationStatus || "Pending", needsReapproval: false };
  return approvalCoversAmount(k)
    ? { status: "Approved", needsReapproval: false }
    : { status: "Pending Approval", needsReapproval: true };
}

/* ── The creator cancelled; someone else takes the slot ───────────────────
 *
 * A deal that is approved and signed can still fall over: the creator pulls out
 * and the team puts another page in the same slot, with the same budget, for
 * the same campaign. Until now the only ways to record that were to overwrite
 * the name — losing who was originally booked and why the deal moved — or to
 * abandon the row and raise a new one, losing the campaign link and the budget
 * it was counted against.
 *
 * The slot survives; the person in it does not. And an approval does not
 * transfer: a yes to ฿15,000 for one creator is not a yes to ฿15,000 for a
 * different one — same money, different reach, different audience, different
 * risk. The person who approved has to see the new name. */

export interface CreatorReplacement {
  name: string;
  handle?: string;
  platform?: string;
  followers?: number;
  masterKolId?: string;
  /** Why the original fell through — kept on the row, not just in someone's chat. */
  reason?: string;
}

/** The row after the swap: new creator in the slot, approval re-opened, the
 *  previous booking written into history, and every result cleared.
 *
 *  Results are cleared because they belonged to the person who left — a post
 *  link and a reach number carried onto the replacement would be somebody
 *  else's work counted as theirs. Money, campaign, brand and branch stay: the
 *  slot is what was budgeted, and that has not changed. */
export function replaceCreator(k: Kol, next: CreatorReplacement, by: string, at: string): Kol {
  const wasName = k.name;
  return {
    ...k,
    name: next.name.trim() || k.name,
    h: next.handle?.trim() || "@tbd",
    plat: next.platform || k.plat,
    followers: next.followers ?? 0,
    masterKolId: next.masterKolId,
    // Whatever the previous creator produced is not the new one's.
    postLink: null, posts: [], postedDate: null,
    actualReach: 0, actualEngagement: 0, engagement: "—", saves: "—", shares: "—",
    // The visit was an appointment with the person who left.
    visitDate: undefined, visitStatus: undefined, visitNote: undefined,
    // The approval was for the previous creator. Cleared, not relabelled — a
    // row that still reads "อนุมัติไว้ ฿15K โดย …" under a different name is the
    // same contradiction the proposal statuses just stopped telling.
    quotationStatus: "Pending Approval",
    approvedAmount: undefined, approvedAt: undefined, approvedBy: undefined,
    // A fresh id, so the re-approval reaches someone instead of pointing at a
    // task that was already ticked off for the previous creator.
    proposalApprovalTaskId: undefined,
    // Contract follows the person too — the signed one was with the other page.
    contractStatus: "Pending",
    currentBlocker: null,
    history: [...(k.history ?? []), {
      type: "creator_replaced" as const, at, by, from: wasName, to: next.name.trim(),
      note: next.reason?.trim() || "",
    }],
  };
}

/** Unmet prerequisites for ENTERING a given stage. Empty = ready. */
export function prerequisitesFor(stage: string, k: Kol): string[] {
  const s = normalizeStage(stage);
  const missing: string[] = [];
  switch (s) {
    case "Owner Assigned":
      if (!hasOwner(k)) missing.push("กำหนด Owner (KOL team) ก่อน");
      break;
    case "Contract Signed":
      if (!contractSigned(k)) missing.push("เซ็นสัญญา (Contract) ให้เรียบร้อย");
      if (!quotationApproved(k)) missing.push("อนุมัติ Rate Card / Proposal");
      break;
    case "In Review":
      if (!hasPostLink(k)) missing.push("แนบ Draft / Post link ก่อนส่งรีวิว");
      break;
    case "Approved":
      if (!hasPostLink(k)) missing.push("ต้องมี Draft/Post link");
      // Approval itself is granted via the Approve action, not by jumping here.
      break;
    case "Posted":
      if (!approvalPassed(k)) missing.push("ต้องผ่าน Approval ก่อน");
      if (!hasPostLink(k)) missing.push("แนบ Final Post link");
      break;
    default:
      break;
  }
  return missing;
}

export interface TransitionResult { ok: boolean; reason?: string }

/** Can this KOL move from its current stage to `to`? Forward moves may only go
 *  one step at a time and must satisfy the target's prerequisites; backward
 *  moves (revisions/corrections) are always allowed. */
export function canTransition(k: Kol, to: string): TransitionResult {
  const from = normalizeStage(k.status);
  const toN = normalizeStage(to);
  const fi = idx(from), ti = idx(toN);
  if (ti < 0) return { ok: false, reason: `สถานะ "${to}" ไม่ถูกต้อง` };
  if (ti === fi) return { ok: true };
  if (ti < fi) return { ok: true }; // backward = revision / correction
  if (ti > fi + 1) return { ok: false, reason: `ห้ามข้ามขั้น — ต้องผ่าน "${KOL_STAGES[fi + 1]}" ก่อน` };
  const missing = prerequisitesFor(toN, k);
  if (missing.length) return { ok: false, reason: missing.join(" · ") };
  return { ok: true };
}

/** Stages reachable right now (for building an accurate dropdown). */
export function allowedStages(k: Kol): { stage: string; ok: boolean; reason?: string }[] {
  return KOL_STAGES.map((stage) => ({ stage, ...canTransition(k, stage) }));
}

/** Results (reach/engagement) may only be entered once posted, with a link. */
export function canSaveResults(k: Kol): TransitionResult {
  const s = normalizeStage(k.status);
  if (s !== "Posted" && s !== "Completed") return { ok: false, reason: "บันทึกผลได้เมื่อสถานะเป็น Posted หรือ Completed" };
  if (!hasPostLink(k)) return { ok: false, reason: "ต้องมี Final Post link ก่อนบันทึกผล" };
  return { ok: true };
}

/** One-line "what to do next" for the drawer's Next-action bar. */
export function nextActionFor(k: Kol): string {
  const s = normalizeStage(k.status);
  switch (s) {
    case "Request": return hasOwner(k) ? "มอบหมาย Owner แล้ว — เลื่อนไป Owner Assigned" : "มอบหมาย Owner (KOL team) ให้คำขอนี้";
    case "Owner Assigned": return "เริ่มเจรจากับ KOL → เลื่อนไป Negotiating";
    case "Negotiating": return "ปิดดีล: เซ็นสัญญา + อนุมัติ Rate Card → Contract Signed";
    case "Contract Signed": return "ส่ง brief และเริ่มผลิตงาน → Producing";
    case "Producing": return "แนบ Draft/Post link แล้วส่งรีวิว → In Review";
    case "In Review": return "รอผู้อนุมัติ Approve หรือ Request Revision";
    case "Approved": return "แนบ Final Post link แล้วเลื่อนเป็น Posted";
    case "Posted": return "บันทึกผล (Reach/Engagement) → Completed";
    case "Completed": return "เสร็จสมบูรณ์ — ข้อมูลถูกบันทึกเข้า KOL Library";
    default: return "อัปเดตสถานะให้ตรงกับความคืบหน้า";
  }
}

/** The single stage the primary "advance" button moves to (next in order). */
export function nextStage(k: Kol): string | null {
  const i = idx(k.status);
  return i >= 0 && i < KOL_STAGES.length - 1 ? KOL_STAGES[i + 1] : null;
}
