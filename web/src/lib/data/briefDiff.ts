// What changed between two versions of a campaign brief — the answer the CMO
// needs before re-approving an edit. Field-level, in the team's own words, and
// SHORT: each entry is one line for the approval log / LINE notification, not a
// JSON dump. Long texts (key message, audience…) are flagged as changed with a
// truncated before→after rather than reproduced in full.
//
// Every line also carries a TIER, which is what decides whether an edit to an
// already-approved campaign needs the CMO to sign it off again:
//
//   major — money, scope, timing, who the campaign is with. The commitments
//           Finance and the CMO agreed to. Goes in the retro-approval queue.
//   minor — how the agreed plan is executed: copy, captions, due dates, which
//           platform a post goes to. Logged, never queued.
//
// The split exists because the old rule was "any edit by a non-CMO revokes the
// approval", so fixing a typo in a caption sent a ฿59K campaign back to the
// approval queue — and the CMO ended up approving several times a week.
//
// Pure (no fetch, no registry writes) so scripts/test-brief-diff.ts can pin the
// wording — these strings end up in the audit trail.

import { CampaignBrief, BriefContentItem, BriefKolItem } from "@/lib/data/brief";
import { brandName } from "@/lib/brands";

/** How much a single changed field costs to wave through. */
export type ChangeTier = "major" | "minor";

export interface BriefChange {
  text: string;
  tier: ChangeTier;
}

const t = (s: string, n = 28) => {
  const v = (s ?? "").trim();
  return v.length > n ? `${v.slice(0, n)}…` : v;
};
const money = (n: number) => `฿${(n || 0).toLocaleString("en-US")}`;

const push = (out: BriefChange[], tier: ChangeTier, text: string) => out.push({ text, tier });

function textChange(out: BriefChange[], tier: ChangeTier, label: string, a: string, b: string) {
  if ((a ?? "").trim() === (b ?? "").trim()) return;
  if (!(a ?? "").trim()) push(out, tier, `${label}: เพิ่ม “${t(b)}”`);
  else if (!(b ?? "").trim()) push(out, tier, `${label}: ลบออก`);
  else push(out, tier, `${label}: “${t(a)}” → “${t(b)}”`);
}

function listChange(out: BriefChange[], tier: ChangeTier, label: string, a: string[], b: string[]) {
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  if (!added.length && !removed.length) return;
  const parts = [
    added.length ? `เพิ่ม ${added.join(", ")}` : "",
    removed.length ? `เอาออก ${removed.join(", ")}` : "",
  ].filter(Boolean);
  push(out, tier, `${label}: ${parts.join(" · ")}`);
}

/** Always major: every one of these is a number Finance committed against. */
function moneyChange(out: BriefChange[], label: string, a: number, b: number) {
  if ((a || 0) === (b || 0)) return;
  push(out, "major", `${label}: ${money(a)} → ${money(b)}`);
}

/** Which fields of a content item changed — named, so "แก้ Content" is never
 *  the whole story.
 *
 *  Every field here is minor. Editing an item that is already in the plan is
 *  the team doing the job the plan asked for; it costs no extra money and
 *  changes no commitment. ADDING or REMOVING an item is a different matter and
 *  is handled by the caller, which counts it major. */
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

/** One change per real difference, ordered roughly by how much the CMO cares. */
export function briefChanges(before: CampaignBrief, after: CampaignBrief): BriefChange[] {
  const out: BriefChange[] = [];

  // The name is major even though it costs nothing: it is the campaign's
  // identity in every other module and in the reporting sheets, all of which
  // store it as text (see the campaign-code notes in db/campaigns).
  textChange(out, "major", "ชื่อแคมเปญ", before.name, after.name);
  if (before.b !== after.b) push(out, "major", `แบรนด์: ${brandName(before.b)} → ${brandName(after.b)}`);
  listChange(out, "major", "สาขา", before.branches, after.branches);
  if (before.startDate !== after.startDate || before.endDate !== after.endDate) {
    push(out, "major", `ช่วงแคมเปญ: ${before.startDate || "—"}–${before.endDate || "—"} → ${after.startDate || "—"}–${after.endDate || "—"}`);
  }
  if (before.launchDate !== after.launchDate) push(out, "major", `Launch: ${before.launchDate || "—"} → ${after.launchDate || "—"}`);
  if (before.objective !== after.objective) push(out, "major", `Objective: ${before.objective} → ${after.objective}`);
  if (before.campaignType !== after.campaignType) push(out, "major", `Type: ${before.campaignType} → ${after.campaignType}`);

  // Money first among the detail fields — it's what re-approval is mostly for.
  moneyChange(out, "งบรวม", before.budget.total, after.budget.total);
  moneyChange(out, "งบ Ads", before.budget.ads, after.budget.ads);
  moneyChange(out, "งบ KOL", before.budget.kol, after.budget.kol);
  moneyChange(out, "งบ Graphic", before.budget.graphic, after.budget.graphic);
  moneyChange(out, "งบ Printing", before.budget.printing, after.budget.printing);
  moneyChange(out, "งบ CRM", before.budget.crm, after.budget.crm);
  moneyChange(out, "งบ Other", before.budget.other, after.budget.other);
  const monthly = (b: CampaignBrief) => (b.budget.monthly ?? []).map((m) => `${m.month}:${m.amount}`).join("|");
  if (monthly(before) !== monthly(after)) push(out, "major", "แบ่งงบรายเดือนถูกแก้");

  // Wording of the pitch — minor. Which channels carry it — major, because the
  // channel mix is where the media money goes.
  textChange(out, "minor", "Target Audience", before.audience, after.audience);
  textChange(out, "minor", "Key Message", before.mainMessage, after.mainMessage);
  textChange(out, "minor", "Main Offer", before.offer, after.offer);
  textChange(out, "minor", "โปรหน้าร้าน", before.storePromotion ?? "", after.storePromotion ?? "");
  listChange(out, "major", "Channels", before.channels, after.channels);

  const goalKeys = Array.from(new Set([...Object.keys(before.successGoals ?? {}), ...Object.keys(after.successGoals ?? {})]));
  for (const k of goalKeys) {
    const a = (before.successGoals?.[k] ?? "").trim();
    const b = (after.successGoals?.[k] ?? "").trim();
    // The number the campaign is judged on. Moving it after approval rewrites
    // the deal, so it is major even though nothing about it costs money.
    if (a !== b) push(out, "major", `เป้า ${k}: ${a || "—"} → ${b || "—"}`);
  }

  // Content items, matched by id so a retitled item reads as an edit, not
  // remove+add.
  const beforeById = new Map(before.content.map((c) => [c.id, c]));
  const afterById = new Map(after.content.map((c) => [c.id, c]));
  for (const c of after.content) {
    const prev = beforeById.get(c.id);
    if (!prev) { push(out, "major", `Content: เพิ่ม “${t(c.title) || "ไม่มีชื่อ"}”`); continue; }
    const changed = contentItemChanges(prev, c);
    if (changed.length) push(out, "minor", `Content “${t(prev.title) || c.id}”: แก้ ${changed.join(", ")}`);
  }
  for (const c of before.content) {
    if (!afterById.get(c.id)) push(out, "major", `Content: ลบ “${t(c.title) || c.id}”`);
  }

  const kolLine = (k: BriefKolItem) => t(k.name || k.kolType);
  const kBefore = new Map(before.kols.map((k) => [k.id, k]));
  const kAfter = new Map(after.kols.map((k) => [k.id, k]));
  for (const k of after.kols) {
    const prev = kBefore.get(k.id);
    if (!prev) { push(out, "major", `KOL: เพิ่ม “${kolLine(k)}”`); continue; }
    const changed: string[] = [];
    // Money, headcount and WHICH page carries the brand are the CMO's call;
    // moving the posting window inside an agreed campaign is scheduling.
    let tier: ChangeTier = "minor";
    if (prev.budget !== k.budget) { changed.push(`งบ ${money(prev.budget)} → ${money(k.budget)}`); tier = "major"; }
    if (prev.count !== k.count) { changed.push(`จำนวน ${prev.count} → ${k.count}`); tier = "major"; }
    if (prev.name !== k.name) { changed.push(`เพจ → “${t(k.name)}”`); tier = "major"; }
    if ((prev.postingStart || "") !== (k.postingStart || "") || (prev.postingEnd || "") !== (k.postingEnd || "")) changed.push("ช่วงโพสต์");
    if (changed.length) push(out, tier, `KOL “${kolLine(prev)}”: แก้ ${changed.join(", ")}`);
  }
  for (const k of before.kols) {
    if (!kAfter.get(k.id)) push(out, "major", `KOL: ลบ “${kolLine(k)}”`);
  }

  return out;
}

/** The same differences as plain lines — what the approval log and the LINE
 *  notification have always shown. */
export function briefDiff(before: CampaignBrief, after: CampaignBrief): string[] {
  return briefChanges(before, after).map((c) => c.text);
}

/** Split for the approval rule: what needs the CMO, and what only needs
 *  recording. An edit with an empty `major` never queues anything. */
export function splitBriefChanges(before: CampaignBrief, after: CampaignBrief): { major: string[]; minor: string[] } {
  const all = briefChanges(before, after);
  return {
    major: all.filter((c) => c.tier === "major").map((c) => c.text),
    minor: all.filter((c) => c.tier === "minor").map((c) => c.text),
  };
}

/** Already-computed change lines as ONE line, capped so a heavy edit doesn't
 *  flood LINE — the full trail is the Approval log. */
export function summariseChanges(lines: string[], max = 8): string {
  if (!lines.length) return "";
  const shown = lines.slice(0, max);
  const more = lines.length - shown.length;
  return shown.join(" · ") + (more > 0 ? ` · +อีก ${more} รายการ` : "");
}

/** The diff as ONE line for a log comment / notification. */
export function briefDiffSummary(before: CampaignBrief, after: CampaignBrief, max = 8): string {
  return summariseChanges(briefDiff(before, after), max);
}
