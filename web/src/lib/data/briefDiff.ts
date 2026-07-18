// What changed between two versions of a campaign brief — the answer the CMO
// needs before re-approving an edit. Field-level, in the team's own words, and
// SHORT: each entry is one line for the approval log / LINE notification, not a
// JSON dump. Long texts (key message, audience…) are flagged as changed with a
// truncated before→after rather than reproduced in full.
//
// Pure (no fetch, no registry writes) so scripts/test-brief-diff.ts can pin the
// wording — these strings end up in the audit trail.

import { CampaignBrief, BriefContentItem, BriefKolItem } from "@/lib/data/brief";
import { brandName } from "@/lib/brands";

const t = (s: string, n = 28) => {
  const v = (s ?? "").trim();
  return v.length > n ? `${v.slice(0, n)}…` : v;
};
const money = (n: number) => `฿${(n || 0).toLocaleString("en-US")}`;

function textChange(out: string[], label: string, a: string, b: string) {
  if ((a ?? "").trim() === (b ?? "").trim()) return;
  if (!(a ?? "").trim()) out.push(`${label}: เพิ่ม “${t(b)}”`);
  else if (!(b ?? "").trim()) out.push(`${label}: ลบออก`);
  else out.push(`${label}: “${t(a)}” → “${t(b)}”`);
}

function listChange(out: string[], label: string, a: string[], b: string[]) {
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  if (!added.length && !removed.length) return;
  const parts = [
    added.length ? `เพิ่ม ${added.join(", ")}` : "",
    removed.length ? `เอาออก ${removed.join(", ")}` : "",
  ].filter(Boolean);
  out.push(`${label}: ${parts.join(" · ")}`);
}

function moneyChange(out: string[], label: string, a: number, b: number) {
  if ((a || 0) === (b || 0)) return;
  out.push(`${label}: ${money(a)} → ${money(b)}`);
}

/** Which fields of a content item changed — named, so "แก้ Content" is never
 *  the whole story. */
function contentItemChanges(a: BriefContentItem, b: BriefContentItem): string[] {
  const changed: string[] = [];
  if (a.title !== b.title) changed.push(`ชื่อ → “${t(b.title)}”`);
  if (a.type !== b.type) changed.push(`type ${a.type} → ${b.type}`);
  if (a.publishDate !== b.publishDate) changed.push(`publish ${a.publishDate || "—"} → ${b.publishDate || "—"}`);
  if (a.graphicDueDate !== b.graphicDueDate) changed.push(`graphic due ${a.graphicDueDate || "—"} → ${b.graphicDueDate || "—"}`);
  if (a.platforms.join("|") !== b.platforms.join("|")) changed.push("platforms");
  if (a.requiredGraphic !== b.requiredGraphic) changed.push(b.requiredGraphic ? "ต้องใช้ graphic" : "ไม่ใช้ graphic แล้ว");
  if (a.requiredVideo !== b.requiredVideo) changed.push(b.requiredVideo ? "ต้องใช้ VDO" : "ไม่ใช้ VDO แล้ว");
  const texts: [keyof BriefContentItem, string][] = [
    ["subHead", "sub head"], ["captionDirection", "caption"], ["mainMessage", "message"],
    ["cta", "CTA"], ["mandatoryText", "mandatory text"], ["doDont", "do/don't"],
  ];
  for (const [k, label] of texts) if ((a[k] ?? "") !== (b[k] ?? "")) changed.push(label);
  return changed;
}

/** One line per real difference, ordered roughly by how much the CMO cares. */
export function briefDiff(before: CampaignBrief, after: CampaignBrief): string[] {
  const out: string[] = [];

  textChange(out, "ชื่อแคมเปญ", before.name, after.name);
  if (before.b !== after.b) out.push(`แบรนด์: ${brandName(before.b)} → ${brandName(after.b)}`);
  listChange(out, "สาขา", before.branches, after.branches);
  if (before.startDate !== after.startDate || before.endDate !== after.endDate) {
    out.push(`ช่วงแคมเปญ: ${before.startDate || "—"}–${before.endDate || "—"} → ${after.startDate || "—"}–${after.endDate || "—"}`);
  }
  if (before.launchDate !== after.launchDate) out.push(`Launch: ${before.launchDate || "—"} → ${after.launchDate || "—"}`);
  if (before.objective !== after.objective) out.push(`Objective: ${before.objective} → ${after.objective}`);
  if (before.campaignType !== after.campaignType) out.push(`Type: ${before.campaignType} → ${after.campaignType}`);

  // Money first among the detail fields — it's what re-approval is mostly for.
  moneyChange(out, "งบรวม", before.budget.total, after.budget.total);
  moneyChange(out, "งบ Ads", before.budget.ads, after.budget.ads);
  moneyChange(out, "งบ KOL", before.budget.kol, after.budget.kol);
  moneyChange(out, "งบ Graphic", before.budget.graphic, after.budget.graphic);
  moneyChange(out, "งบ Printing", before.budget.printing, after.budget.printing);
  moneyChange(out, "งบ CRM", before.budget.crm, after.budget.crm);
  moneyChange(out, "งบ Other", before.budget.other, after.budget.other);
  const monthly = (b: CampaignBrief) => (b.budget.monthly ?? []).map((m) => `${m.month}:${m.amount}`).join("|");
  if (monthly(before) !== monthly(after)) out.push("แบ่งงบรายเดือนถูกแก้");

  textChange(out, "Target Audience", before.audience, after.audience);
  textChange(out, "Key Message", before.mainMessage, after.mainMessage);
  textChange(out, "Main Offer", before.offer, after.offer);
  textChange(out, "โปรหน้าร้าน", before.storePromotion ?? "", after.storePromotion ?? "");
  listChange(out, "Channels", before.channels, after.channels);

  const goalKeys = Array.from(new Set([...Object.keys(before.successGoals ?? {}), ...Object.keys(after.successGoals ?? {})]));
  for (const k of goalKeys) {
    const a = (before.successGoals?.[k] ?? "").trim();
    const b = (after.successGoals?.[k] ?? "").trim();
    if (a !== b) out.push(`เป้า ${k}: ${a || "—"} → ${b || "—"}`);
  }

  // Content items, matched by id so a retitled item reads as an edit, not
  // remove+add.
  const beforeById = new Map(before.content.map((c) => [c.id, c]));
  const afterById = new Map(after.content.map((c) => [c.id, c]));
  for (const c of after.content) {
    const prev = beforeById.get(c.id);
    if (!prev) { out.push(`Content: เพิ่ม “${t(c.title) || "ไม่มีชื่อ"}”`); continue; }
    const changed = contentItemChanges(prev, c);
    if (changed.length) out.push(`Content “${t(prev.title) || c.id}”: แก้ ${changed.join(", ")}`);
  }
  for (const c of before.content) {
    if (!afterById.get(c.id)) out.push(`Content: ลบ “${t(c.title) || c.id}”`);
  }

  const kolLine = (k: BriefKolItem) => t(k.name || k.kolType);
  const kBefore = new Map(before.kols.map((k) => [k.id, k]));
  const kAfter = new Map(after.kols.map((k) => [k.id, k]));
  for (const k of after.kols) {
    const prev = kBefore.get(k.id);
    if (!prev) { out.push(`KOL: เพิ่ม “${kolLine(k)}”`); continue; }
    const changed: string[] = [];
    if (prev.budget !== k.budget) changed.push(`งบ ${money(prev.budget)} → ${money(k.budget)}`);
    if (prev.count !== k.count) changed.push(`จำนวน ${prev.count} → ${k.count}`);
    if (prev.name !== k.name) changed.push(`เพจ → “${t(k.name)}”`);
    if ((prev.postingStart || "") !== (k.postingStart || "") || (prev.postingEnd || "") !== (k.postingEnd || "")) changed.push("ช่วงโพสต์");
    if (changed.length) out.push(`KOL “${kolLine(prev)}”: แก้ ${changed.join(", ")}`);
  }
  for (const k of before.kols) {
    if (!kAfter.get(k.id)) out.push(`KOL: ลบ “${kolLine(k)}”`);
  }

  return out;
}

/** The diff as ONE line for a log comment / notification, capped so a heavy
 *  edit doesn't flood LINE — the full trail is the Approval log. */
export function briefDiffSummary(before: CampaignBrief, after: CampaignBrief, max = 8): string {
  const all = briefDiff(before, after);
  if (!all.length) return "";
  const shown = all.slice(0, max);
  const more = all.length - shown.length;
  return shown.join(" · ") + (more > 0 ? ` · +อีก ${more} รายการ` : "");
}
