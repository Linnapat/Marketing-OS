/* มุม "ตามโพสต์" ของ Status Dashboard — แคมเปญ → โพสต์ → งาน Graphic/VDO
 *
 * ทำไมต้องมีมุมที่สาม ทั้งที่บอร์ดมี "ตามแคมเปญ" กับ "ตามคน" อยู่แล้ว:
 *
 * สองมุมนั้นวาง Content กับ Graphic ไว้คนละแถวใต้แคมเปญเดียวกัน
 * มันตอบได้ว่า "มีงานอะไรบ้าง" แต่ตอบไม่ได้ว่า "โพสต์วันที่ 10 อาร์ตเวิร์กถึงไหนแล้ว"
 * เพราะไม่มีอะไรผูกสองแถวนั้นเข้าด้วยกันบนหน้าจอ
 *
 * ส่วน productionSteps() รู้คำตอบอยู่แล้ว — บรีฟ → Storyboard → ถ่าย → ตัดต่อ
 * พร้อมคนที่ค้างแต่ละขั้น — แต่มันโผล่แค่ใน drawer ทีละใบ จะรู้สถานะ 22 ใบงาน
 * ต้องเปิด 22 ครั้ง ไฟล์นี้คือการเอาคำตอบนั้นออกมากางให้เห็นพร้อมกันทั้งเดือน
 *
 * กับดักที่ตั้งใจเลี่ยง: `post.assetStatus` เป็นค่าที่พิมพ์ไว้ในโพสต์เอง ไม่ใช่
 * ความคืบหน้าจริงของใบงาน — 21 จาก 23 โพสต์ของ OMD เดือน ก.ย. ค้างคำว่า
 * "Waiting Design" ทั้งที่ใบงานบางใบเดินไปถึง In Progress แล้ว แกน Asset ของ
 * โพสต์ในหน้านี้จึงอ่านจากใบงานจริง ไม่ใช่จากช่องนั้น (ดู postHealth)
 *
 * Pure ล้วน ไม่มี fetch — เทสต์ได้โดยไม่ต้องต่อ DB ดู scripts/test-tracker.ts
 * แถวที่ใช้เป็นชุดเดียวกับที่บอร์ดดึงมาแล้ว มุมนี้จึงไม่ยิง query เพิ่ม */

import { BrandId } from "@/lib/brands";
import {
  ContentItem, captionOwner, contentDateIso, itemPlatforms, isPostFinished,
} from "@/lib/data/content";
import {
  Graphic, LinkablePost, ProductionStep, WORK_KIND_LABEL,
  deliverableProgress, findLinkedPost, isGraphicFinished, jobHolder,
  productionBlockers, productionSteps, workKind,
} from "@/lib/data/graphic";
import {
  Health, Urgency, commonHealth, graphicHealth, urgencyOf, worstHealth,
} from "@/lib/data/statusBoard";

/** งานที่หาแคมเปญไม่เจอ ใช้คีย์เดียวกับ Status Dashboard เพื่อให้สองหน้าพูดตรงกัน
 *  โชว์ไว้ตั้งใจ — การเงียบ ๆ ทิ้งแถวไปคือวิธีที่งานหายหลังเปลี่ยนชื่อแคมเปญ */
export const UNASSIGNED = "__unassigned__";

/* ── หน่วยย่อยสุด: ใบงาน Graphic/VDO หนึ่งใบ ─────────────────────────────── */

export interface TrackerJob {
  id: string;
  code?: string;
  title: string;
  /** "Graphic" · "VDO · งานตัด" · "VDO · งานถ่าย" · "Photo · งานถ่าย" */
  kindLabel: string;
  type: string;
  stage: string;
  /** ช่อง designer ดิบของใบงาน = คนที่ถูกตั้งไว้ตอนเปิดงาน ไม่ใช่คนที่ถืออยู่จริง */
  designer?: string;
  /** คนที่ถืองานใบนี้อยู่จริง null = ยังไม่มีใครถือ (ดู jobHolder) */
  holder?: string;
  health: Health;
  dueIso?: string;
  urgency: Urgency;
  /** ขั้นทั้งหมดตามลำดับจริง — เอามาวาดเป็นราง 4 จุดบนการ์ด */
  steps: ProductionStep[];
  /** ขั้นแรกที่ยังไม่ done = คอขวดจริงของใบนี้
   *
   *  ไม่ได้อ่านจาก step.state === "active" ตรง ๆ เพราะ productionSteps ปล่อยให้
   *  หลายขั้น active พร้อมกันได้ (บรีฟยังไม่ครบ แต่ designer ลงมือแล้ว) —
   *  "ขั้นแรกที่ยังไม่เสร็จ" เป็นคำตอบที่ถูกเสมอไม่ว่าจะกี่ขั้น active */
  current?: ProductionStep;
  progress: { approved: number; total: number };
  blockers: string[];
  finished: boolean;
}

export function toJob(g: Graphic, todayIso: string): TrackerJob {
  const steps = productionSteps(g);
  const health = graphicHealth(g);
  const { approved, total } = deliverableProgress(g);
  return {
    id: String(g.id),
    code: g.code,
    title: g.title,
    kindLabel: WORK_KIND_LABEL[workKind(g.type, g.requiredVideo)],
    type: g.type,
    stage: g.stage,
    designer: g.designer,
    holder: jobHolder(g) ?? undefined,
    health,
    dueIso: g.dueIso,
    urgency: urgencyOf(g.dueIso, health, todayIso),
    steps,
    current: steps.find((s) => s.state !== "done" && s.state !== "skipped"),
    progress: { approved, total },
    blockers: productionBlockers(g),
    finished: isGraphicFinished(g),
  };
}

/* ── การ์ดหนึ่งใบ = โพสต์หนึ่งโพสต์ ────────────────────────────────────── */

export interface TrackerPost {
  id: string;
  code?: string;
  title: string;
  dateIso: string;
  platforms: string[];
  brand: BrandId;
  campaignId: string;
  captionOwner: string;
  captionStatus: string;
  approvalStatus: string;
  publishStatus: string;
  /** ค่าที่พิมพ์ไว้ในโพสต์ เก็บไว้โชว์เฉย ๆ ไม่ได้ใช้คิด health (ดูหัวไฟล์) */
  assetStatus: string;
  jobs: TrackerJob[];
  /** ยังไม่มีใครเปิดใบงานให้โพสต์นี้เลย — จุดบอดที่หน้านี้มีไว้เพื่อจับ */
  noJob: boolean;
  health: Health;
  /** แกนที่ตัดสิน health: "Caption" · "Asset" · "Approval" · "Publish" */
  decidedBy: string;
  /** เส้นตายของโพสต์คือวันลง ไม่ใช่ due ของใบงาน — อาร์ตเวิร์กเสร็จวันโพสต์
   *  ก็คือสายแล้ว */
  urgency: Urgency;
  /** ใบงานที่เลยกำหนดของตัวเองไปแล้ว ทั้งที่โพสต์ยังไม่ถึงวันลง
   *
   *  จุดบอดตัวจริงของหน้านี้: ชุด Brand Awareness ก.ย. มีใบงาน 7 ใบครบกำหนด
   *  10 ส.ค. และเลยมาแล้ว 6 วัน แต่โพสต์ลง 5–19 ก.ย. ทุกอย่างที่ดูจากวันโพสต์
   *  จึงบอกว่า "ยังมีเวลา" — เดือนหน้าถึงค่อยรู้ว่าไม่ทัน ตัวเลขนี้ทำให้เห็น
   *  ตั้งแต่วันนี้ */
  jobsOverdue: number;
  /** ตอนนี้รอใคร ทำอะไร — มาจากขั้นที่ค้างของใบงานที่วิกฤตที่สุด */
  waitingOn?: { who: string; what: string; role: string };
}

/** แกน Asset ของโพสต์ อ่านจากใบงานจริง ไม่ใช่จาก assetStatus ที่พิมพ์ค้างไว้
 *
 *  โพสต์ที่ยังไม่มีใบงานเลยคือ notStarted เสมอ ไม่ว่าช่อง assetStatus จะเขียน
 *  ว่าอะไร — "Waiting Design" ที่ไม่มีใบงานรองรับ แปลว่ายังไม่มีใครเริ่ม */
function assetAxis(jobs: TrackerJob[]): Health {
  return jobs.length ? worstHealth(jobs.map((j) => j.health)) : "notStarted";
}

export function postHealth(
  c: Pick<ContentItem, "captionStatus" | "approvalStatus" | "publishStatus">,
  jobs: TrackerJob[],
): { health: Health; decidedBy: string } {
  const axes: [string, Health][] = [
    ["Caption", commonHealth(c.captionStatus) ?? "active"],
    ["Asset", assetAxis(jobs)],
    ["Approval", commonHealth(c.approvalStatus) ?? "active"],
    ["Publish", commonHealth(c.publishStatus) ?? "active"],
  ];
  const worst = worstHealth(axes.map(([, h]) => h));
  return { health: worst, decidedBy: axes.find(([, h]) => h === worst)?.[0] ?? "Caption" };
}

/** ใบงานที่ควรพูดแทนโพสต์: สายที่สุดก่อน แล้วค่อยแย่ที่สุด
 *
 *  เรียงตามความสายก่อน health เพราะโพสต์ที่มีใบงานสองใบ — ใบหนึ่งเลยกำหนดแต่
 *  แค่ "กำลังทำ" อีกใบยังไม่เริ่มแต่ยังมีเวลาอีกเดือน — สิ่งที่ต้องรีบคือใบแรก */
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, dueSoon: 1, later: 2, none: 3 };
const healthRank = (h: Health) => ["blocked", "waiting", "notStarted", "active", "done"].indexOf(h);

export function leadJob(jobs: TrackerJob[]): TrackerJob | undefined {
  const live = jobs.filter((j) => !j.finished);
  return (live.length ? live : jobs)
    .slice()
    .sort((a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
      || healthRank(a.health) - healthRank(b.health))[0];
}

export function toPost(c: ContentItem, jobs: TrackerJob[], todayIso: string): TrackerPost {
  const dateIso = contentDateIso(c);
  const { health, decidedBy } = postHealth(c, jobs);
  const lead = leadJob(jobs);
  // ถ้าโพสต์ลงไปแล้ว ไม่ต้องบอกว่ารอใคร — งานจบแล้ว การขึ้นว่ารอ designer
  // บนโพสต์ที่โพสต์ไปเมื่อวานคือเสียงรบกวน
  const step = isPostFinished(c) ? undefined : lead?.current;
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    dateIso,
    platforms: itemPlatforms(c),
    brand: c.b,
    campaignId: c.campaignId ?? "",
    captionOwner: captionOwner(c),
    captionStatus: c.captionStatus,
    approvalStatus: c.approvalStatus,
    publishStatus: c.publishStatus,
    assetStatus: c.assetStatus,
    jobs,
    noJob: jobs.length === 0,
    health,
    decidedBy,
    urgency: urgencyOf(dateIso, health, todayIso),
    jobsOverdue: jobs.filter((j) => j.urgency === "overdue").length,
    waitingOn: step ? { who: step.owner, what: step.label, role: step.role } : undefined,
  };
}

/* ── ชั้นบนสุด: แคมเปญ ──────────────────────────────────────────────────── */

export interface TrackerCampaign {
  campaignId: string;
  name: string;
  brand?: BrandId;
  status?: string;
  posts: TrackerPost[];
  /** ใบงานของแคมเปญนี้ที่ผูกกับโพสต์ไหนไม่ได้ ไม่ทิ้ง — โชว์ท้ายกลุ่ม
   *  ใบงานที่หลุดจากแผนคอนเทนต์คือของจริงที่มีคนทำอยู่ ไม่ใช่ขยะ */
  looseJobs: TrackerJob[];
  counts: Record<Health, number>;
  /** โพสต์ที่เลยวันลงไปแล้วทั้งที่ยังไม่เสร็จ */
  overdue: number;
  /** ใบงานที่เลย due ของตัวเอง รวมใบที่ซ่อนอยู่ใต้โพสต์ที่ยังไม่ถึงกำหนด */
  jobsOverdue: number;
  health: Health;
}

export interface CampaignSeed {
  id: string;
  name: string;
  b?: BrandId;
  status?: string;
}

/** ประกอบต้นไม้ทั้งหมด แคมเปญ → โพสต์ → ใบงาน
 *
 *  ใช้ findLinkedPost เป็นตัวจับคู่ตัวเดียว ไม่เขียนกฎ matching ใหม่:
 *  มันไล่จาก contentPostId → post.graphicRequestId → sourceContentItemId
 *  (scope ด้วยแคมเปญ) → ชื่อตรงเป๊ะในแคมเปญเดียวกัน ซึ่งคือชุดกฎที่หน้า
 *  Graphic ใช้อยู่แล้ว การเขียนกฎที่สองที่นี่แปลว่าสองหน้าจะจับคู่ไม่เหมือนกัน */
export function buildTracker(
  campaigns: CampaignSeed[],
  posts: ContentItem[],
  graphics: Graphic[],
  todayIso: string,
): TrackerCampaign[] {
  const linkable: (LinkablePost & { src: ContentItem })[] = posts.map((c) => ({
    id: c.id,
    campaign: c.campaign,
    campaignId: c.campaignId,
    title: c.title,
    sourceContentItemId: c.sourceContentItemId,
    graphicRequestId: c.graphicRequestId,
    src: c,
  }));

  const jobsByPost = new Map<string, TrackerJob[]>();
  const loose: Graphic[] = [];
  for (const g of graphics) {
    const hit = findLinkedPost(g, linkable);
    if (hit) {
      const list = jobsByPost.get(hit.id) ?? [];
      list.push(toJob(g, todayIso));
      jobsByPost.set(hit.id, list);
    } else {
      loose.push(g);
    }
  }

  const cards = posts.map((c) => toPost(c, jobsByPost.get(c.id) ?? [], todayIso));

  const seeds = new Map(campaigns.map((c) => [c.id, c]));
  const ids = new Set<string>([
    ...cards.map((p) => p.campaignId || UNASSIGNED),
    ...loose.map((g) => g.campaignId || UNASSIGNED),
  ]);

  return [...ids]
    .map((id) => {
      const seed = seeds.get(id);
      const mine = cards
        .filter((p) => (p.campaignId || UNASSIGNED) === id)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.title.localeCompare(b.title));
      const orphans = loose
        .filter((g) => (g.campaignId || UNASSIGNED) === id)
        .map((g) => toJob(g, todayIso))
        .sort((a, b) => (a.dueIso ?? "").localeCompare(b.dueIso ?? ""));
      const counts = { blocked: 0, waiting: 0, notStarted: 0, active: 0, done: 0 } as Record<Health, number>;
      mine.forEach((p) => { counts[p.health] += 1; });
      return {
        campaignId: id,
        name: seed?.name ?? (id === UNASSIGNED ? "ยังไม่ผูกกับแคมเปญ" : id),
        brand: seed?.b ?? mine[0]?.brand,
        status: seed?.status,
        posts: mine,
        looseJobs: orphans,
        counts,
        overdue: mine.filter((p) => p.urgency === "overdue").length,
        jobsOverdue: mine.reduce((n, p) => n + p.jobsOverdue, 0)
          + orphans.filter((j) => j.urgency === "overdue").length,
        health: worstHealth(mine.map((p) => p.health)),
      };
    })
    // แคมเปญที่มีของสายอยู่ขึ้นก่อน แล้วเรียงตามวันโพสต์แรกของแคมเปญ
    // นับใบงานสายด้วย ไม่ใช่แค่โพสต์สาย — แคมเปญที่ใบงานเลย due ยกชุดแต่โพสต์
    // ยังไม่ถึงวันลง คือแคมเปญที่ต้องเห็นก่อนใครเพื่อน
    .sort((a, b) =>
      (late(b) ? 1 : 0) - (late(a) ? 1 : 0)
      || (a.posts[0]?.dateIso ?? "9999").localeCompare(b.posts[0]?.dateIso ?? "9999")
      || a.name.localeCompare(b.name));
}

const late = (g: Pick<TrackerCampaign, "overdue" | "jobsOverdue">) => g.overdue > 0 || g.jobsOverdue > 0;

/* ── ตัวเลขหัวหน้า ─────────────────────────────────────────────────────── */

export interface TrackerSummary {
  posts: number;
  jobs: number;
  /** โพสต์ที่เลยวันลงแล้วยังไม่เสร็จ */
  overdue: number;
  /** ใบงานที่เลย due ตัวเอง — ตัวเลขที่ปฏิทินโพสต์มองไม่เห็น */
  jobsOverdue: number;
  blocked: number;
  noJob: number;
  /** โพสต์ที่ยังไม่มีใครถือ — ทุกใบงานยังไม่ระบุ designer */
  unassigned: number;
}

/** มีคนถืองานใบนี้อยู่จริงไหม
 *
 *  อ่านจาก holder ไม่ใช่ designer: ใบงานที่คนอื่นรับไปทำแล้ว (acceptedBy) หรือ
 *  ส่งงานเข้ามาแล้ว (submittedBy) ยังมี designer เป็น "Unassigned" ได้ — อ่าน
 *  ช่องนั้นตรง ๆ จะขึ้นว่าไม่มีคนถือทับงานที่มีคนทำอยู่ และนับเข้าตัวเลข
 *  "ยังไม่มีคนถือ" ทั้งที่ไม่ใช่ (เจอจริง 1 ใบ: OMD_2609_001-C02-A01) */
export function hasDesigner(j: TrackerJob): boolean {
  return !!(j.holder ?? "").trim();
}

export function summarise(groups: TrackerCampaign[]): TrackerSummary {
  const posts = groups.flatMap((g) => g.posts);
  const loose = groups.flatMap((g) => g.looseJobs);
  const jobs = [...posts.flatMap((p) => p.jobs), ...loose];
  return {
    posts: posts.length,
    jobs: jobs.length,
    overdue: posts.filter((p) => p.urgency === "overdue").length,
    jobsOverdue: jobs.filter((j) => j.urgency === "overdue").length,
    blocked: posts.filter((p) => p.health === "blocked").length,
    noJob: posts.filter((p) => p.noJob && !isFinishedPost(p)).length,
    unassigned: posts.filter((p) => p.jobs.length > 0 && !p.jobs.some(hasDesigner)).length,
  };
}

const isFinishedPost = (p: TrackerPost) => p.health === "done";

/* ── ค้นหา ───────────────────────────────────────────────────────────────
 *
 * กติกาเดียวกับช่องค้นหาในหน้า Content: ทุกคำต้องเจอที่ไหนสักแห่งในแถวนั้น
 * ("kani reel" = โพสต์ Kani ที่มีงาน Reel) เขียนกฎซ้ำแบบอื่นแปลว่าพิมพ์คำ
 * เดียวกันสองหน้าแล้วได้ผลไม่เท่ากัน */

/** ทุกอย่างที่ช่องค้นหาอ่านของโพสต์หนึ่งใบ
 *
 *  `code` (OMD_2609_001-C01) สำคัญเป็นพิเศษ — เป็นสิ่งที่คนก๊อปจากแชตมาหา และ
 *  เพราะขึ้นต้นด้วยรหัสแคมเปญ พิมพ์แค่ OMD_2609_001 ก็ได้ทุกโพสต์ใต้แคมเปญนั้น
 *
 *  รวมชื่อคนที่ถือใบงานด้วย เพราะคำถามที่ถามบ่อยพอ ๆ กับ "แคมเปญนี้ถึงไหน"
 *  คือ "คิวของ Jeeno มีอะไรบ้าง" และการ์ดก็แสดงชื่อนั้นอยู่แล้ว */
export function postSearchText(p: TrackerPost, campaignName: string): string {
  return [
    p.title, p.code, campaignName,
    p.platforms.join(" "),
    p.captionOwner,
    p.captionStatus, p.approvalStatus, p.publishStatus,
    p.dateIso,
    // ทั้ง designer ที่ตั้งไว้และคนที่ถือจริง — ค้นด้วยชื่อไหนก็ต้องเจอ
    ...p.jobs.flatMap((j) => [j.title, j.code, j.kindLabel, j.type, j.designer, j.holder, j.stage, j.current?.label]),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function jobSearchText(j: TrackerJob, campaignName: string): string {
  return [j.title, j.code, campaignName, j.kindLabel, j.type, j.designer, j.holder, j.stage, j.dueIso]
    .filter(Boolean).join(" ").toLowerCase();
}

/** แยกคำค้นเป็นคำ ๆ — ช่องว่างคือ AND ไม่ใช่วลีเดียว */
export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

const matches = (hay: string, terms: string[]) => terms.every((t) => hay.includes(t));

/* ── ตัวกรองรวมของมุม "ตามโพสต์" ───────────────────────────────────────── */

export interface TrackerFilter {
  /** วันโพสต์อยู่ในช่วงที่เลือกไหม — ตัวตัดสินมาจาก DateFilterBar ไม่ใช่จากที่นี่
   *  ใบงานลอยไม่มีโพสต์ให้ยึด จึงวัดด้วย due ของตัวเอง
   *  ไม่ส่งมา = ไม่กรองเวลา */
  inPeriod?: (iso: string) => boolean;
  terms?: string[];
  brand?: string;
  isBrandVisible?: (b: BrandId) => boolean;
  health?: Health | "all";
  urgency?: Urgency | "all";
  /** เฉพาะที่สาย — นับทั้งโพสต์เลยวันลง และใบงานที่เลย due ของตัวเอง */
  lateOnly?: boolean;
}

/** กรองต้นไม้ทั้งก้อนด้วยตัวกรองแถวบนของบอร์ด
 *
 *  แคมเปญที่ไม่เหลืออะไรหลังกรองถูกตัดทิ้ง — กล่องเปล่าไม่ได้บอกอะไร
 *  ยกเว้นตอนไม่ได้กรองอะไรเลย ซึ่งแคมเปญว่างเป็นข้อมูลในตัวมันเอง */
export function filterTracker(groups: TrackerCampaign[], f: TrackerFilter): TrackerCampaign[] {
  const terms = f.terms ?? [];
  const period = f.inPeriod;
  const visible = f.isBrandVisible ?? (() => true);
  return groups
    .map((g) => ({
      ...g,
      posts: g.posts.filter((p) =>
        (!period || period(p.dateIso))
        && (!f.brand || f.brand === "all" || p.brand === f.brand)
        && visible(p.brand)
        && (!f.health || f.health === "all" || p.health === f.health)
        && (!f.urgency || f.urgency === "all" || p.urgency === f.urgency)
        && (!f.lateOnly || p.urgency === "overdue" || p.jobsOverdue > 0)
        && matches(postSearchText(p, g.name), terms)),
      // ใบลอยไม่มีแบรนด์/สถานะของโพสต์ให้เทียบ จึงกรองได้แค่เวลากับคำค้น และ
      // ซ่อนไปเมื่อมีตัวกรองที่มันตอบไม่ได้ — โผล่ค้างอยู่ใบเดียวใต้ตัวกรอง
      // "ติดปัญหา" อ่านเหมือนมันติดปัญหาด้วย
      looseJobs: (f.health && f.health !== "all") || (f.urgency && f.urgency !== "all") || f.lateOnly
        ? []
        : g.looseJobs.filter((j) =>
          (!period || period(j.dueIso ?? "")) && matches(jobSearchText(j, g.name), terms)),
    }))
    .filter((g) => g.campaignId === UNASSIGNED || !g.brand || visible(g.brand))
    .filter((g) => g.posts.length > 0 || g.looseJobs.length > 0);
}
