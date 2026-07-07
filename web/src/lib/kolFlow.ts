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
const quotationApproved = (k: Kol) => /approved/i.test(k.quotationStatus || "");
/** Approval passed = the KOL has reached (or moved past) the Approved stage. */
const approvalPassed = (k: Kol) => idx(k.status) >= idx("Approved");

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
      if (!quotationApproved(k)) missing.push("อนุมัติใบเสนอราคา (Quotation)");
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
    case "Negotiating": return "ปิดดีล: เซ็นสัญญา + อนุมัติใบเสนอราคา → Contract Signed";
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
