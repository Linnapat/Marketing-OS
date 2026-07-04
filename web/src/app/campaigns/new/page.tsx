"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Plus, Copy, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DatePicker } from "@/components/ui/DatePicker";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { BrandDot } from "@/components/ui/BrandDot";
import { BRAND_ORDER, BRANDS, BrandId, brandName } from "@/lib/brands";
import { BRANDS_DATA } from "@/lib/data/settings";
import {
  CampaignBrief, emptyBrief, emptyContentItem, emptyKolItem,
  OBJECTIVES, SUCCESS_METRICS, CONTENT_TYPES, CONTENT_PLATFORMS, KOL_TYPES, KOL_CONTENT,
  CHANNELS, ADS_PLATFORMS, PRIORITIES, budgetSummary, guidelineChecklist, taskPreview,
  BriefContentItem, BriefKolItem,
} from "@/lib/data/brief";
import { saveCampaignBrief } from "@/lib/db/brief";
import { baht } from "@/lib/format";

const STEPS = [
  "Campaign Overview", "Guideline Checklist", "Content Plan",
  "KOL Plan", "Budget Allocation", "Auto Task Preview", "Submit",
];

const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
const label = "block text-[11.5px] font-bold text-faint mb-[6px]";

function newCampaignId(): string {
  const n = new Date();
  const rnd = Math.floor(1000 + (n.getTime() % 9000));
  return `CAM-${n.getFullYear()}-${String(rnd).padStart(4, "0")}`;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [id] = useState(newCampaignId);
  const [brief, setBrief] = useState<CampaignBrief>(() => ({ ...emptyBrief(id) }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(1);

  const set = <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => setBrief((b) => ({ ...b, [k]: v }));
  const nextSeq = () => { const s = seq; setSeq((x) => x + 1); return s; };

  const branches = useMemo(() => BRANDS_DATA.find((d) => d.key === brief.b)?.branchList ?? [], [brief.b]);
  const bs = useMemo(() => budgetSummary(brief), [brief]);
  const checklist = useMemo(() => guidelineChecklist(brief), [brief]);
  const preview = useMemo(() => taskPreview(brief), [brief]);
  const checklistDone = checklist.filter((c) => c.done).length;

  // Publish / posting dates outside the campaign period → soft warnings.
  const outOfRange = (iso: string) => iso && brief.startDate && brief.endDate && (iso < brief.startDate || iso > brief.endDate);
  const rangeWarnings = useMemo(() => {
    const w: string[] = [];
    brief.content.forEach((c) => { if (outOfRange(c.publishDate)) w.push(`Content “${c.title || "—"}” publish date อยู่นอกช่วง campaign`); });
    brief.kols.forEach((k) => { if (outOfRange(k.postingStart)) w.push(`KOL ${k.kolType} posting date อยู่นอกช่วง campaign`); });
    return w;
  }, [brief]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = brief.name.trim() && brief.startDate && brief.endDate && brief.plannerOwner;

  const submit = async (asDraft: boolean) => {
    if (!brief.name.trim()) { setStep(0); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const status = asDraft ? "Draft" : "Waiting for Approval";
    const log = asDraft ? brief.approvalLog : [...brief.approvalLog, { action: "Submitted for approval", by: brief.plannerOwner || "Planner", at: now }];
    const finalBrief: CampaignBrief = { ...brief, status, approvalLog: log, createdAt: now };
    try {
      await saveCampaignBrief(finalBrief);
      router.push(`/campaigns/${brief.id}`);
    } catch { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Campaign Builder"
        title="Create Campaign"
        subtitle="สร้าง campaign brief แบบ flexible — ออกแบบเอง มี guideline ช่วยไม่ให้ตกหล่น แล้วแตกงานอัตโนมัติ"
        right={<Link href="/campaigns" className="text-[12.5px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">← Campaigns</Link>}
      />

      {/* Stepper */}
      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className="flex items-center gap-2 flex-shrink-0">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={i === step ? { background: "#211F1C", color: "#fff" } : i < step ? { background: "#4E7A4E", color: "#fff" } : { background: "#E8E2D6", color: "#9A9387" }}>{i + 1}</span>
            <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: i === step ? "#211F1C" : "#9A9387" }}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-5 h-[2px] mx-1" style={{ background: i < step ? "#4E7A4E" : "#E5DECF" }} />}
          </button>
        ))}
      </div>

      <div className="mt-5 max-w-[900px]">
        {step === 0 && <Overview brief={brief} set={set} branches={branches} />}
        {step === 1 && <Guideline checklist={checklist} done={checklistDone} />}
        {step === 2 && <ContentPlan brief={brief} setBrief={setBrief} nextSeq={nextSeq} outOfRange={outOfRange} />}
        {step === 3 && <KolPlan brief={brief} setBrief={setBrief} nextSeq={nextSeq} branches={branches} outOfRange={outOfRange} />}
        {step === 4 && <Budget brief={brief} setBrief={setBrief} bs={bs} />}
        {step === 5 && <Preview preview={preview} warnings={[...bs.warnings, ...rangeWarnings]} />}
        {step === 6 && <Submit brief={brief} set={set} canSubmit={!!canSubmit} busy={busy} onSubmit={submit} checklistDone={checklistDone} total={checklist.length} />}
      </div>

      {/* Footer nav */}
      <div className="mt-6 max-w-[900px] flex items-center justify-between">
        <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4 py-[9px] bg-surface disabled:opacity-40">← Back</button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[9px]">Next →</button>
        ) : (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => submit(true)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4 py-[9px] bg-surface disabled:opacity-40">Save Draft</button>
            <button disabled={busy || !canSubmit} onClick={() => submit(false)} className="text-[13px] font-bold text-white rounded-[10px] px-5 py-[9px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>{busy ? "Creating…" : "Submit Campaign"}</button>
          </div>
        )}
      </div>
    </>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg p-5 mb-4">
      <div className="text-[14px] font-bold mb-1">{title}</div>
      {hint && <div className="text-[12px] text-faint mb-4">{hint}</div>}
      {!hint && <div className="mb-4" />}
      {children}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" onClick={() => toggle(o)} className="text-[12px] font-semibold px-[12px] py-[6px] rounded-pill border transition-colors"
            style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { color: "#6b6258", background: "#fff", borderColor: "#E5DECF" }}>{o}</button>
        );
      })}
    </div>
  );
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
function Overview({ brief, set, branches }: { brief: CampaignBrief; set: <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => void; branches: string[] }) {
  return (
    <>
      <Panel title="Campaign Overview" hint="ข้อมูลหลักของแคมเปญ — ไม่มีเทมเพลตบังคับ กรอกตามที่แคมเปญนี้ต้องการ">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={label}>Campaign Name <span className="text-status-red">*</span></label>
            <input value={brief.name} onChange={(e) => set("name", e.target.value)} className={field} placeholder="เช่น Wagyu Festival — July" autoFocus />
          </div>
          <div>
            <label className={label}>Brand</label>
            <select value={brief.b} onChange={(e) => set("b", e.target.value as BrandId)} className={field}>
              {BRAND_ORDER.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Branch</label>
            <select value={brief.branch} onChange={(e) => set("branch", e.target.value)} className={field}>
              <option value="">All branches</option>
              {branches.map((br) => <option key={br} value={br}>{br}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Objective</label>
            <select value={brief.objective} onChange={(e) => set("objective", e.target.value)} className={field}>
              {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start Date <span className="text-status-red">*</span></label>
              <DatePicker value={brief.startDate || null} onChange={(v) => set("startDate", v)} max={brief.endDate || undefined} />
            </div>
            <div>
              <label className={label}>End Date <span className="text-status-red">*</span></label>
              <DatePicker value={brief.endDate || null} onChange={(v) => set("endDate", v)} min={brief.startDate || undefined}
                invalid={!!brief.startDate && !!brief.endDate && brief.endDate < brief.startDate} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={label}>Target Audience</label>
            <input value={brief.audience} onChange={(e) => set("audience", e.target.value)} className={field} placeholder="เช่น คนทำงานย่านทองหล่อ 25–40 ชอบอาหารญี่ปุ่น" />
          </div>
          <div>
            <label className={label}>Main Message</label>
            <input value={brief.mainMessage} onChange={(e) => set("mainMessage", e.target.value)} className={field} placeholder="ข้อความหลักที่อยากสื่อ" />
          </div>
          <div>
            <label className={label}>Offer / Promotion</label>
            <input value={brief.offer} onChange={(e) => set("offer", e.target.value)} className={field} placeholder="เช่น ลด 20% / เซ็ตพิเศษ" />
          </div>
          <div className="md:col-span-2">
            <label className={label}>Channels</label>
            <Chips options={CHANNELS} value={brief.channels} onChange={(v) => set("channels", v)} />
          </div>
          <div>
            <label className={label}>Campaign Concept</label>
            <textarea value={brief.concept} onChange={(e) => set("concept", e.target.value)} rows={3} className={field} placeholder="ไอเดีย/ธีมของแคมเปญ" />
          </div>
          <div>
            <label className={label}>Key Visual Direction</label>
            <textarea value={brief.kvDirection} onChange={(e) => set("kvDirection", e.target.value)} rows={3} className={field} placeholder="โทน สี มู้ด อ้างอิงภาพ" />
          </div>
          <div className="md:col-span-2">
            <label className={label}>Success Metrics</label>
            <Chips options={SUCCESS_METRICS} value={brief.successMetrics} onChange={(v) => set("successMetrics", v)} />
          </div>
          <div>
            <label className={label}>Planner Owner <span className="text-status-red">*</span></label>
            <OwnerSelect value={brief.plannerOwner} onChange={(v) => set("plannerOwner", v)} team="Planner" placeholder="เลือก planner" />
          </div>
          <div>
            <label className={label}>Approver</label>
            <OwnerSelect value={brief.approver} onChange={(v) => set("approver", v)} placeholder="เลือกผู้อนุมัติ" />
          </div>
        </div>
      </Panel>
    </>
  );
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
function Guideline({ checklist, done }: { checklist: { key: string; label: string; done: boolean }[]; done: number }) {
  return (
    <Panel title="Campaign Guideline Checklist" hint="ตัวช่วยเช็คให้คิดครบ — ไม่บังคับ ยังสร้างแคมเปญได้แม้ยังไม่ครบ">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(done / checklist.length) * 100}%`, background: "#4E7A4E" }} /></div>
        <span className="text-[12.5px] font-bold text-muted">{done}/{checklist.length}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        {checklist.map((c) => (
          <div key={c.key} className="flex items-center gap-[10px] px-[13px] py-[10px] rounded-[10px]" style={{ background: c.done ? "#EEF4EE" : "#FAF8F4", border: `1px solid ${c.done ? "#C8E0C8" : "#EEE8DE"}` }}>
            <span className="text-[15px]">{c.done ? "✅" : "⬜"}</span>
            <span className="text-[12.5px] font-medium" style={{ color: c.done ? "#4E7A4E" : "#6b6258" }}>{c.label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Step 3 ──────────────────────────────────────────────────────────────────
function ContentPlan({ brief, setBrief, nextSeq, outOfRange }: {
  brief: CampaignBrief; setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; nextSeq: () => number; outOfRange: (iso: string) => boolean | "" | undefined;
}) {
  const upd = (id: string, patch: Partial<BriefContentItem>) => setBrief((b) => ({ ...b, content: b.content.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  const add = () => setBrief((b) => ({ ...b, content: [...b.content, { ...emptyContentItem(nextSeq()) }] }));
  const dup = (id: string) => setBrief((b) => { const src = b.content.find((c) => c.id === id); return src ? { ...b, content: [...b.content, { ...src, id: `ci-${nextSeq()}` }] } : b; });
  const rm = (id: string) => setBrief((b) => ({ ...b, content: b.content.filter((c) => c.id !== id) }));

  return (
    <Panel title="Content Plan" hint="Planner กำหนดจำนวน content เองได้ — เพิ่ม/ทำซ้ำ/ลบ ได้อิสระ">
      <div className="flex flex-col gap-3">
        {brief.content.map((c, i) => (
          <div key={c.id} className="border border-line2 rounded-[14px] p-4 bg-ivory">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-bold text-muted">Content #{i + 1}</span>
              <div className="flex gap-1">
                <button onClick={() => dup(c.id)} title="Duplicate" className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-muted"><Copy size={13} /></button>
                <button onClick={() => rm(c.id)} title="Remove" className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-status-red"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><label className={label}>Content Title</label><input value={c.title} onChange={(e) => upd(c.id, { title: e.target.value })} className={field} placeholder="เช่น Wagyu plating reel" /></div>
              <div><label className={label}>Content Type</label><select value={c.type} onChange={(e) => upd(c.id, { type: e.target.value })} className={field}>{CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className={label}>Platform</label><select value={c.platform} onChange={(e) => upd(c.id, { platform: e.target.value })} className={field}>{CONTENT_PLATFORMS.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className={label}>Publish Date</label><DatePicker value={c.publishDate || null} onChange={(v) => upd(c.id, { publishDate: v })} invalid={!!outOfRange(c.publishDate)} /></div>
              <div><label className={label}>Priority</label><select value={c.priority} onChange={(e) => upd(c.id, { priority: e.target.value })} className={field}>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className={label}>Caption Owner</label><OwnerSelect value={c.captionOwner} onChange={(v) => upd(c.id, { captionOwner: v })} team="Planner" /></div>
              <div><label className={label}>Creative Owner</label><OwnerSelect value={c.creativeOwner} onChange={(v) => upd(c.id, { creativeOwner: v })} team="Creative" /></div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted"><input type="checkbox" checked={c.requiredGraphic} onChange={(e) => upd(c.id, { requiredGraphic: e.target.checked })} /> Required Graphic</label>
                <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted"><input type="checkbox" checked={c.requiredVideo} onChange={(e) => upd(c.id, { requiredVideo: e.target.checked })} /> Required Video</label>
              </div>
              <div><label className={label}>Status</label><input value={c.status} onChange={(e) => upd(c.id, { status: e.target.value })} className={field} placeholder="Planned" /></div>
              <div className="md:col-span-2"><label className={label}>Note</label><input value={c.note} onChange={(e) => upd(c.id, { note: e.target.value })} className={field} placeholder="รายละเอียดเพิ่มเติม" /></div>
            </div>
          </div>
        ))}
        {brief.content.length === 0 && <div className="text-[12.5px] text-faint text-center py-6 border border-dashed border-line2 rounded-[12px]">ยังไม่มี content — กด “Add Content Item”</div>}
      </div>
      <button onClick={add} className="mt-3 flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]"><Plus size={14} /> Add Content Item</button>
    </Panel>
  );
}

// ── Step 4 ──────────────────────────────────────────────────────────────────
function KolPlan({ brief, setBrief, nextSeq, branches, outOfRange }: {
  brief: CampaignBrief; setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; nextSeq: () => number; branches: string[]; outOfRange: (iso: string) => boolean | "" | undefined;
}) {
  const upd = (id: string, patch: Partial<BriefKolItem>) => setBrief((b) => ({ ...b, kols: b.kols.map((k) => k.id === id ? { ...k, ...patch } : k) }));
  const add = () => setBrief((b) => ({ ...b, kols: [...b.kols, { ...emptyKolItem(nextSeq()) }] }));
  const dup = (id: string) => setBrief((b) => { const src = b.kols.find((k) => k.id === id); return src ? { ...b, kols: [...b.kols, { ...src, id: `kr-${nextSeq()}` }] } : b; });
  const rm = (id: string) => setBrief((b) => ({ ...b, kols: b.kols.filter((k) => k.id !== id) }));
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;

  return (
    <Panel title="KOL Plan" hint="Planner กำหนดจำนวน KOL / เพจ เองได้ — เพิ่ม/ทำซ้ำ/ลบ">
      <div className="flex flex-col gap-3">
        {brief.kols.map((k, i) => (
          <div key={k.id} className="border border-line2 rounded-[14px] p-4 bg-ivory">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-bold text-muted">KOL Requirement #{i + 1}</span>
              <div className="flex gap-1">
                <button onClick={() => dup(k.id)} className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-muted"><Copy size={13} /></button>
                <button onClick={() => rm(k.id)} className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-status-red"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div><label className={label}>KOL Type</label><select value={k.kolType} onChange={(e) => upd(k.id, { kolType: e.target.value })} className={field}>{KOL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className={label}># Creator / Page</label><input value={k.count || ""} onChange={(e) => upd(k.id, { count: num(e.target.value) })} className={field} placeholder="1" /></div>
              <div><label className={label}>Budget</label><input value={k.budget || ""} onChange={(e) => upd(k.id, { budget: num(e.target.value) })} className={field} placeholder="฿" /></div>
              <div><label className={label}>Expected Reach</label><input value={k.expectedReach || ""} onChange={(e) => upd(k.id, { expectedReach: num(e.target.value) })} className={field} placeholder="50000" /></div>
              <div><label className={label}>Expected Engagement</label><input value={k.expectedEngagement || ""} onChange={(e) => upd(k.id, { expectedEngagement: num(e.target.value) })} className={field} placeholder="4000" /></div>
              <div><label className={label}>Branch / Area</label><select value={k.area} onChange={(e) => upd(k.id, { area: e.target.value })} className={field}><option value="">—</option>{branches.map((br) => <option key={br}>{br}</option>)}</select></div>
              <div><label className={label}>Posting Start</label><DatePicker value={k.postingStart || null} onChange={(v) => upd(k.id, { postingStart: v })} max={k.postingEnd || undefined} invalid={!!outOfRange(k.postingStart)} /></div>
              <div><label className={label}>Posting End</label><DatePicker value={k.postingEnd || null} onChange={(v) => upd(k.id, { postingEnd: v })} min={k.postingStart || undefined} /></div>
              <div><label className={label}>Owner</label><OwnerSelect value={k.owner} onChange={(v) => upd(k.id, { owner: v })} team="KOL" /></div>
              <div className="md:col-span-3"><label className={label}>Content Required</label><Chips options={KOL_CONTENT} value={k.contentRequired} onChange={(v) => upd(k.id, { contentRequired: v })} /></div>
              <div className="md:col-span-3"><label className={label}>Note</label><input value={k.note} onChange={(e) => upd(k.id, { note: e.target.value })} className={field} /></div>
            </div>
          </div>
        ))}
        {brief.kols.length === 0 && <div className="text-[12.5px] text-faint text-center py-6 border border-dashed border-line2 rounded-[12px]">ยังไม่มี KOL — กด “Add KOL Requirement”</div>}
      </div>
      <button onClick={add} className="mt-3 flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]"><Plus size={14} /> Add KOL Requirement</button>
    </Panel>
  );
}

// ── Step 5 ──────────────────────────────────────────────────────────────────
function Budget({ brief, setBrief, bs }: { brief: CampaignBrief; setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; bs: ReturnType<typeof budgetSummary> }) {
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;
  const setB = (patch: Partial<CampaignBrief["budget"]>) => setBrief((b) => ({ ...b, budget: { ...b.budget, ...patch } }));
  const setAds = (i: number, patch: Partial<{ platform: string; amount: number }>) => setBrief((b) => ({ ...b, budget: { ...b.budget, adsByPlatform: b.budget.adsByPlatform.map((a, j) => j === i ? { ...a, ...patch } : a) } }));
  const addAds = () => setBrief((b) => ({ ...b, budget: { ...b.budget, adsByPlatform: [...b.budget.adsByPlatform, { platform: ADS_PLATFORMS[0], amount: 0 }] } }));
  const rmAds = (i: number) => setBrief((b) => ({ ...b, budget: { ...b.budget, adsByPlatform: b.budget.adsByPlatform.filter((_, j) => j !== i) } }));
  const buckets: [string, keyof CampaignBrief["budget"]][] = [
    ["Ads Budget", "ads"], ["KOL Budget", "kol"], ["Graphic / Production", "graphic"],
    ["Printing / POSM", "printing"], ["CRM / LINE OA", "crm"], ["Other", "other"],
  ];

  return (
    <>
      <Panel title="Budget Allocation" hint="ใส่งบรวมแล้วเกลี่ยไปแต่ละส่วน — ระบบคำนวณคงเหลือ + % และเตือนถ้าเกิน/ไม่ครบ">
        <div className="mb-4">
          <label className={label}>Total Campaign Budget</label>
          <input value={brief.budget.total || ""} onChange={(e) => setB({ total: num(e.target.value) })} className={`${field} max-w-[260px]`} placeholder="฿" />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {buckets.map(([lbl, key]) => (
            <div key={key}><label className={label}>{lbl}</label><input value={(brief.budget[key] as number) || ""} onChange={(e) => setB({ [key]: num(e.target.value) } as Partial<CampaignBrief["budget"]>)} className={field} placeholder="฿" /></div>
          ))}
        </div>

        <div className="mt-5">
          <div className="text-[12.5px] font-bold text-muted mb-2">Ads Budget by Platform</div>
          <div className="flex flex-col gap-2">
            {brief.budget.adsByPlatform.map((a, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={a.platform} onChange={(e) => setAds(i, { platform: e.target.value })} className={`${field} max-w-[220px]`}>{ADS_PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
                <input value={a.amount || ""} onChange={(e) => setAds(i, { amount: num(e.target.value) })} className={`${field} max-w-[160px]`} placeholder="฿" />
                <button onClick={() => rmAds(i)} className="w-8 h-8 rounded-[8px] border border-line2 bg-surface flex items-center justify-center text-status-red flex-shrink-0"><X size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={addAds} className="mt-2 flex items-center gap-1 text-[12px] font-bold text-accent"><Plus size={13} /> Add platform</button>
        </div>
      </Panel>

      <Panel title="Allocation Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ["Total", baht(brief.budget.total, { compact: true }), "#211F1C"],
            ["Allocated", baht(bs.allocated, { compact: true }), "#3E5C9A"],
            ["Remaining", baht(bs.remaining, { compact: true }), bs.remaining < 0 ? "#B33A2E" : "#4E7A4E"],
            ["Ads by platform", baht(bs.adsAllocated, { compact: true }), bs.adsMismatch ? "#B33A2E" : "#211F1C"],
          ].map(([l, v, c]) => (
            <div key={l} className="bg-ivory border border-line2 rounded-card p-3">
              <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-1">{l}</div>
              <div className="text-[17px] font-extrabold" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {bs.byBucket.filter((b) => b.amount > 0).map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-[12px] text-muted w-40 flex-shrink-0">{b.label}</span>
              <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, b.pct)}%`, background: "#B8945A" }} /></div>
              <span className="text-[12px] font-bold text-ink w-12 text-right">{b.pct}%</span>
            </div>
          ))}
        </div>
        {bs.warnings.length > 0 && (
          <div className="rounded-card px-4 py-3 text-[12.5px]" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
            {bs.warnings.map((w, i) => <div key={i} className="font-semibold">⚠ {w}</div>)}
          </div>
        )}
      </Panel>
    </>
  );
}

// ── Step 6 ──────────────────────────────────────────────────────────────────
function Preview({ preview, warnings }: { preview: ReturnType<typeof taskPreview>; warnings: string[] }) {
  const total = preview.reduce((s, p) => s + p.count, 0);
  return (
    <Panel title="Auto Task Preview" hint={`ระบบจะสร้างงานเหล่านี้ให้อัตโนมัติเมื่อกด Submit — รวม ${total} รายการ ผูกกับแคมเปญนี้`}>
      <div className="grid md:grid-cols-2 gap-3">
        {preview.map((p) => (
          <div key={p.kind} className="flex items-center gap-3 border border-line2 rounded-card p-4 bg-ivory">
            <span className="text-[22px]">{p.icon}</span>
            <div className="flex-1"><div className="text-[13.5px] font-bold text-ink">{p.count} {p.kind}</div><div className="text-[11.5px] text-faint">{p.detail}</div></div>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 rounded-card px-4 py-3 text-[12.5px]" style={{ background: "#FBF6ED", border: "1px solid #EDCC7A", color: "#8A6D1E" }}>
          {warnings.map((w, i) => <div key={i} className="font-semibold">⚠ {w}</div>)}
        </div>
      )}
    </Panel>
  );
}

// ── Step 7 ──────────────────────────────────────────────────────────────────
function Submit({ brief, set, canSubmit, busy, onSubmit, checklistDone, total }: {
  brief: CampaignBrief; set: <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => void;
  canSubmit: boolean; busy: boolean; onSubmit: (draft: boolean) => void; checklistDone: number; total: number;
}) {
  return (
    <Panel title="Review & Submit" hint="ตรวจสอบก่อนสร้าง — Save Draft ไว้แก้ต่อ หรือ Submit เพื่อส่งอนุมัติและแตกงานอัตโนมัติ">
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {[
          ["Campaign", brief.name || "—"], ["Brand", brandName(brief.b)], ["Objective", brief.objective],
          ["Period", `${brief.startDate || "—"} → ${brief.endDate || "—"}`], ["Content items", String(brief.content.length)],
          ["KOL requirements", String(brief.kols.length)], ["Total budget", baht(brief.budget.total, { compact: true })],
          ["Guideline", `${checklistDone}/${total} checked`],
        ].map(([l, v]) => (
          <div key={l} className="flex items-center justify-between border-b border-line4 py-2">
            <span className="text-[12px] text-faint font-semibold">{l}</span><span className="text-[13px] font-bold text-ink">{v}</span>
          </div>
        ))}
      </div>
      {!canSubmit && <div className="text-[12.5px] text-status-orange font-semibold mb-3">ต้องกรอกอย่างน้อย: ชื่อแคมเปญ, วันเริ่ม/สิ้นสุด, Planner owner ก่อน Submit</div>}
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-bold text-faint">Status</span>
        <span className="text-[12px] font-bold px-3 py-[5px] rounded-pill" style={{ background: "#F2F0EB", color: "#6b6258" }}>{brief.status}</span>
      </div>
    </Panel>
  );
}
