"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Copy, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DatePicker } from "@/components/ui/DatePicker";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { KolItemForm } from "@/components/kol/KolItemForm";
import { useAuth } from "@/lib/auth";
import { BRAND_ORDER, BRANDS, BrandId, brandName } from "@/lib/brands";
import { BRANDS_DATA } from "@/lib/data/settings";
import {
  CampaignBrief, emptyBrief, emptyContentItem, emptyKolItem,
  OBJECTIVES, CAMPAIGN_TYPES, SUCCESS_METRICS, CONTENT_TYPES, CONTENT_PLATFORMS, assetSizesFor,
  CHANNELS, ADS_PLATFORMS, PRIORITIES,
  budgetSummary, guidelineChecklist, taskPreview, validateSubmit,
  kolBudgetTotal, withSyncedKolBudget,
  BriefContentItem, BriefKolItem, GuidelineItem,
} from "@/lib/data/brief";
import { saveCampaignBrief } from "@/lib/db/brief";
import { notify } from "@/lib/notify";
import { baht } from "@/lib/format";

// Guideline sits just before Submit — a final pre-flight, not an early gate.
const STEPS = ["Campaign Overview", "Content Plan", "KOL Plan", "Budget Allocation", "Auto Task Preview", "Guideline Checklist", "Submit"];
// There is a single campaign approver (the CMO) — assigned automatically.
const CMO_NAME = "Linnapat D.";

const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
const label = "block text-[11.5px] font-bold text-faint mb-[6px]";

function newCampaignId(): string {
  const n = new Date();
  const rnd = Math.floor(1000 + (n.getTime() % 9000));
  return `CAM-${n.getFullYear()}-${String(rnd).padStart(4, "0")}`;
}

// Step-1 (Overview) required-field check → { fieldKey: message }, in visual order.
function overviewErrors(b: CampaignBrief): Record<string, string> {
  const e: Record<string, string> = {};
  if (!b.name.trim()) e.name = "กรุณากรอกชื่อแคมเปญ";
  if (b.branches.length === 0) e.branches = "กรุณาเลือกอย่างน้อย 1 สาขา";
  if (!b.startDate) e.startDate = "กรุณาเลือก Start Date";
  if (!b.endDate) e.endDate = "กรุณาเลือก End Date";
  else if (b.startDate && b.endDate < b.startDate) e.endDate = "End Date ต้องไม่ก่อน Start Date";
  if (!b.launchDate) e.launchDate = "กรุณาเลือก Launch Date";
  if (!b.audience.trim()) e.audience = "กรุณากรอก Target Audience";
  if (!b.mainMessage.trim()) e.mainMessage = "กรุณากรอก Key Message";
  if (!b.offer.trim()) e.offer = "กรุณากรอก Main Offer";
  return e;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { member, user } = useAuth();
  const [id] = useState(newCampaignId);
  const [brief, setBrief] = useState<CampaignBrief>(() => ({ ...emptyBrief(id), approver: CMO_NAME }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(1);
  const [triedNext, setTriedNext] = useState(false); // show step-1 inline errors after first Next
  const [ackWarn, setAckWarn] = useState(false);      // acknowledge unresolved warnings before Submit

  const set = <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => setBrief((b) => ({ ...b, [k]: v }));
  const nextSeq = () => { const s = seq; setSeq((x) => x + 1); return s; };

  // Planner = the logged-in user (auto, read-only). Keep it synced to auth.
  const me = member?.name ?? user?.email ?? "";
  useEffect(() => { if (me) setBrief((b) => ({ ...b, plannerOwner: me })); }, [me]);

  const branches = useMemo(() => BRANDS_DATA.find((d) => d.key === brief.b)?.branchList ?? [], [brief.b]);
  const bs = useMemo(() => budgetSummary(brief), [brief]);
  const checklist = useMemo(() => guidelineChecklist(brief), [brief]);
  const preview = useMemo(() => taskPreview(brief), [brief]);
  const errors = useMemo(() => validateSubmit(brief), [brief]);

  const outOfRange = (iso: string) => iso && brief.startDate && brief.endDate && (iso < brief.startDate || iso > brief.endDate);
  const rangeWarnings = useMemo(() => {
    const w: string[] = [];
    brief.content.forEach((c) => { if (outOfRange(c.publishDate)) w.push(`Content “${c.title || "—"}” publish date อยู่นอกช่วง campaign`); });
    brief.kols.forEach((k) => { if (outOfRange(k.postingStart)) w.push(`KOL ${k.name || k.kolType} posting date อยู่นอกช่วง campaign`); });
    return w;
  }, [brief]); // eslint-disable-line react-hooks/exhaustive-deps

  const allWarnings = [...bs.warnings, ...rangeWarnings];
  const ovErrors = triedNext ? overviewErrors(brief) : {};
  // Submit is blocked by hard errors AND by unresolved warnings unless acknowledged.
  const canSubmit = errors.length === 0 && (allWarnings.length === 0 || ackWarn);

  // Next validates step 1 inline: scroll to the first missing field instead of failing silently.
  const goNext = () => {
    if (step === 0) {
      setTriedNext(true);
      const e = overviewErrors(brief);
      const first = Object.keys(e)[0];
      if (first) { setTimeout(() => document.getElementById(`ov-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); return; }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finalize = (status: CampaignBrief["status"], log: CampaignBrief["approvalLog"], now: string): CampaignBrief =>
    withSyncedKolBudget({ ...brief, branch: brief.branches.join(", "), status, approvalLog: log, createdAt: now });

  const submit = async (asDraft: boolean) => {
    // Save Draft is exempt from validation; Submit is blocked when required
    // fields are missing.
    if (!asDraft && errors.length) { setStep(6); return; }
    if (asDraft && !brief.name.trim()) { setStep(0); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const status = asDraft ? "Draft" : "Waiting for Approval";
    const logEntry = { action: "Submitted for approval", by: brief.plannerOwner || "Planner", at: now };
    const log = asDraft ? brief.approvalLog : [...brief.approvalLog, logEntry];
    try {
      await saveCampaignBrief(finalize(status, log, now));
      if (!asDraft) notify("approval", `🎯 แคมเปญใหม่รออนุมัติ: ${brief.name}`, `โดย ${brief.plannerOwner || "Planner"} → รอ ${brief.approver || "CMO"} อนุมัติใน My Tasks`, "/my-tasks");
      // Land on the list so the new campaign is visible in context immediately.
      router.push("/campaigns");
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
        {step === 0 && <Overview brief={brief} set={set} setBrief={setBrief} branches={branches} planner={me} errors={ovErrors} />}
        {step === 1 && <ContentPlan brief={brief} setBrief={setBrief} nextSeq={nextSeq} outOfRange={outOfRange} />}
        {step === 2 && <KolPlan brief={brief} setBrief={setBrief} nextSeq={nextSeq} branches={branches} outOfRange={outOfRange} />}
        {step === 3 && <Budget brief={brief} setBrief={setBrief} bs={bs} onEditKol={() => setStep(2)} />}
        {step === 4 && <Preview preview={preview} warnings={allWarnings} />}
        {step === 5 && <Guideline checklist={checklist} />}
        {step === 6 && <Submit brief={brief} errors={errors} warnings={allWarnings} ack={ackWarn} onAck={setAckWarn} checklist={checklist} />}
      </div>

      <div className="mt-6 max-w-[900px] flex items-center justify-between">
        <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4 py-[9px] bg-surface disabled:opacity-40">← Back</button>
        {step < STEPS.length - 1 ? (
          <button onClick={goNext}
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
      {hint ? <div className="text-[12px] text-faint mb-4">{hint}</div> : <div className="mb-4" />}
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
function Overview({ brief, set, setBrief, branches, planner, errors }: {
  brief: CampaignBrief; set: <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => void;
  setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; branches: string[]; planner: string;
  errors: Record<string, string>;
}) {
  const errBorder = { borderColor: "#B33A2E", background: "#FFF7F6" };
  const errText = "text-[11px] text-status-red font-semibold mt-1";
  const toggleBranch = (br: string) => setBrief((b) => ({ ...b, branches: b.branches.includes(br) ? b.branches.filter((x) => x !== br) : [...b.branches, br] }));
  const toggleMetric = (m: string) => setBrief((b) => ({ ...b, successMetrics: b.successMetrics.includes(m) ? b.successMetrics.filter((x) => x !== m) : [...b.successMetrics, m] }));
  const setGoal = (m: string, v: string) => setBrief((b) => ({ ...b, successGoals: { ...b.successGoals, [m]: v } }));
  const endInvalid = !!brief.startDate && !!brief.endDate && brief.endDate < brief.startDate;
  return (
    <Panel title="Campaign Overview" hint="ข้อมูลหลักของแคมเปญ — ไม่มีเทมเพลตบังคับ กรอกตามที่แคมเปญนี้ต้องการ">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2" id="ov-name">
          <label className={label}>Campaign Name <span className="text-status-red">*</span></label>
          <input value={brief.name} onChange={(e) => set("name", e.target.value)} className={field} style={errors.name ? errBorder : undefined} placeholder="เช่น Wagyu Festival — July" autoFocus />
          {errors.name && <p className={errText}>{errors.name}</p>}
        </div>
        <div>
          <label className={label}>Brand</label>
          <select value={brief.b} onChange={(e) => setBrief((b) => ({ ...b, b: e.target.value as BrandId, branches: [] }))} className={field}>
            {BRAND_ORDER.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
          </select>
        </div>
        {/* Branch — directly under Brand */}
        <div id="ov-branches">
          <label className={label}>Branch <span className="text-status-red">*</span> <span className="text-faint font-normal">· หลายสาขา ({brief.branches.length})</span></label>
          {errors.branches && <p className={errText + " mb-1"}>{errors.branches}</p>}
          <div className="flex flex-wrap gap-2">
            {branches.length === 0 && <span className="text-[12px] text-faint">ไม่มีสาขาสำหรับแบรนด์นี้</span>}
            {branches.map((br) => {
              const on = brief.branches.includes(br);
              return (
                <label key={br} className="flex items-center gap-2 text-[12px] font-semibold px-[10px] py-[6px] rounded-[9px] border cursor-pointer"
                  style={on ? { background: "#EEF4EE", borderColor: "#4E7A4E", color: "#4E7A4E" } : { background: "#fff", borderColor: "#E5DECF", color: "#6b6258" }}>
                  <input type="checkbox" checked={on} onChange={() => toggleBranch(br)} /> {br}
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <label className={label}>Campaign Type</label>
          <select value={brief.campaignType} onChange={(e) => set("campaignType", e.target.value)} className={field}>
            {CAMPAIGN_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Objective</label>
          <select value={brief.objective} onChange={(e) => set("objective", e.target.value)} className={field}>
            {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Campaign Priority</label>
          <select value={brief.priority} onChange={(e) => set("priority", e.target.value)} className={field}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>

        {/* Success Metrics — multi-select + goal per metric, sitting under Objective */}
        <div className="md:col-span-2">
          <label className={label}>Success Metrics <span className="text-faint font-normal">· เลือกได้หลายตัว แล้วใส่เป้าหมาย</span></label>
          <div className="flex flex-wrap gap-2">
            {SUCCESS_METRICS.map((m) => {
              const on = brief.successMetrics.includes(m);
              return (
                <button key={m} type="button" onClick={() => toggleMetric(m)} className="text-[12px] font-semibold px-[12px] py-[6px] rounded-pill border transition-colors"
                  style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { color: "#6b6258", background: "#fff", borderColor: "#E5DECF" }}>{m}</button>
              );
            })}
          </div>
          {brief.successMetrics.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              {brief.successMetrics.map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted w-28 flex-shrink-0">{m} goal</span>
                  <input value={brief.successGoals[m] ?? ""} onChange={(e) => setGoal(m, e.target.value)} className="flex-1 text-[13px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" placeholder="เช่น 50000 / 3.5%" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dates */}
        <div id="ov-startDate">
          <label className={label}>Start Date <span className="text-status-red">*</span></label>
          <DatePicker value={brief.startDate || null} onChange={(v) => set("startDate", v)} max={brief.endDate || undefined} invalid={!!errors.startDate} />
          {errors.startDate && <p className={errText}>{errors.startDate}</p>}
        </div>
        <div id="ov-endDate">
          <label className={label}>End Date <span className="text-status-red">*</span></label>
          <DatePicker value={brief.endDate || null} onChange={(v) => set("endDate", v)} min={brief.startDate || undefined} invalid={endInvalid || !!errors.endDate} />
          {(errors.endDate || endInvalid) && <div className="text-[11px] text-status-red font-semibold mt-1">{errors.endDate || "End Date ต้องไม่ก่อน Start Date"}</div>}
        </div>
        <div id="ov-launchDate">
          <label className={label}>Launch Date <span className="text-status-red">*</span></label>
          <DatePicker value={brief.launchDate || null} onChange={(v) => set("launchDate", v)} min={brief.startDate || undefined} max={brief.endDate || undefined} invalid={!!errors.launchDate} />
          {errors.launchDate && <p className={errText}>{errors.launchDate}</p>}
        </div>

        <div className="md:col-span-2" id="ov-audience">
          <label className={label}>Target Audience <span className="text-status-red">*</span></label>
          <input value={brief.audience} onChange={(e) => set("audience", e.target.value)} className={field} style={errors.audience ? errBorder : undefined} placeholder="เช่น คนทำงานย่านทองหล่อ 25–40 ชอบอาหารญี่ปุ่น" />
          {errors.audience && <p className={errText}>{errors.audience}</p>}
        </div>
        <div id="ov-mainMessage">
          <label className={label}>Key Message <span className="text-status-red">*</span></label>
          <input value={brief.mainMessage} onChange={(e) => set("mainMessage", e.target.value)} className={field} style={errors.mainMessage ? errBorder : undefined} placeholder="ข้อความหลักที่อยากสื่อ" />
          {errors.mainMessage && <p className={errText}>{errors.mainMessage}</p>}
        </div>
        <div id="ov-offer">
          <label className={label}>Main Offer <span className="text-status-red">*</span></label>
          <input value={brief.offer} onChange={(e) => set("offer", e.target.value)} className={field} style={errors.offer ? errBorder : undefined} placeholder="เช่น ลด 20% / เซ็ตพิเศษ" />
          {errors.offer && <p className={errText}>{errors.offer}</p>}
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
          <label className={label}>Planner <span className="text-faint font-normal">· คุณ (ผู้ที่ล็อกอิน)</span></label>
          <input value={planner || "—"} readOnly disabled className={`${field} bg-line4 cursor-not-allowed opacity-80`} />
        </div>
      </div>
    </Panel>
  );
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
function GuidelineRow(c: GuidelineItem) {
  return (
    <div key={c.key} className="flex items-center gap-[10px] px-[13px] py-[10px] rounded-[10px]" style={{ background: c.done ? "#EEF4EE" : "#FAF8F4", border: `1px solid ${c.done ? "#C8E0C8" : "#EEE8DE"}` }}>
      <span className="text-[15px]">{c.done ? "✅" : "⬜"}</span>
      <span className="text-[12.5px] font-medium" style={{ color: c.done ? "#4E7A4E" : "#6b6258" }}>{c.label}</span>
    </div>
  );
}

function Guideline({ checklist }: { checklist: GuidelineItem[] }) {
  const must = checklist.filter((c) => c.must);
  const nice = checklist.filter((c) => !c.must);
  const mustDone = must.filter((c) => c.done).length;
  const niceDone = nice.filter((c) => c.done).length;
  const mustOk = mustDone === must.length;
  return (
    <Panel title="Campaign Guideline Checklist" hint="Must-have ต้องครบถึงจะ Submit ได้ · Nice-to-have แนะนำแต่ไม่บังคับ (แจ้งเตือนอย่างเดียว)">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-bold" style={{ color: mustOk ? "#4E7A4E" : "#B33A2E" }}>Must-have {mustDone}/{must.length}</span>
        <span className="text-[11.5px] font-semibold" style={{ color: mustOk ? "#4E7A4E" : "#B33A2E" }}>{mustOk ? "— ครบแล้ว พร้อม Submit" : "— ยังไม่ครบ · Submit ไม่ได้"}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-2 mb-5">{must.map(GuidelineRow)}</div>
      <div className="text-[13px] font-bold text-muted mb-2">Nice-to-have {niceDone}/{nice.length} <span className="text-[11.5px] text-faint font-normal">— แนะนำ ไม่บล็อก Submit</span></div>
      <div className="grid md:grid-cols-2 gap-2">{nice.map(GuidelineRow)}</div>
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
    <Panel title="Content Plan" hint="เลือก Platform ได้หลายที่ (ช่องติ๊ก) แล้วเลือก Asset Size ของแต่ละ platform — Owner ทีม Creative จะเลือกทีหลัง">
      <div className="flex flex-col gap-3">
        {brief.content.map((c, i) => {
          return (
            <div key={c.id} className="border border-line2 rounded-[14px] p-4 bg-ivory">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-bold text-muted">Content #{i + 1}</span>
                <div className="flex gap-1">
                  <button onClick={() => dup(c.id)} title="Duplicate" className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-muted"><Copy size={13} /></button>
                  <button onClick={() => rm(c.id)} title="Remove" className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-status-red"><Trash2 size={13} /></button>
                </div>
              </div>
              <ContentItemForm item={c} onChange={(patch) => upd(c.id, patch)} outOfRange={(iso) => !!outOfRange(iso)} />
            </div>
          );
        })}
        {brief.content.length === 0 && <div className="text-[12.5px] text-faint text-center py-6 border border-dashed border-line2 rounded-[12px]">ยังไม่มี content — กด “Add Content Item”</div>}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={add} className="flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]"><Plus size={14} /> Add Content Item</button>
      </div>
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

  return (
    <Panel title="KOL Plan" hint="ระบุ requirement (ยังไม่ต้องรู้ชื่อเพจ) — specialist เสนอเพจจริงทีหลัง · ฟอร์มเดียวกับ Request KOL · งบ sync ไป Budget Allocation">
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
            <KolItemForm item={k} onChange={(patch) => upd(k.id, patch)} branches={branches} outOfRange={(iso) => !!outOfRange(iso)} hidePage />
          </div>
        ))}
        {brief.kols.length === 0 && <div className="text-[12.5px] text-faint text-center py-6 border border-dashed border-line2 rounded-[12px]">ยังไม่มี KOL — กด “Add KOL Requirement”</div>}
      </div>
      <div className="flex items-center justify-between mt-3">
        <button onClick={add} className="flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]"><Plus size={14} /> Add KOL Requirement</button>
        <div className="text-[12.5px] font-bold text-muted">KOL Budget รวม: <span className="text-ink">{baht(kolBudgetTotal(brief), { compact: true })}</span></div>
      </div>
    </Panel>
  );
}

// ── Step 5 ──────────────────────────────────────────────────────────────────
function Budget({ brief, setBrief, bs, onEditKol }: { brief: CampaignBrief; setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; bs: ReturnType<typeof budgetSummary>; onEditKol: () => void }) {
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;
  const setB = (patch: Partial<CampaignBrief["budget"]>) => setBrief((b) => ({ ...b, budget: { ...b.budget, ...patch } }));
  const setAds = (i: number, patch: Partial<{ platform: string; amount: number }>) => setBrief((b) => ({ ...b, budget: { ...b.budget, adsByPlatform: b.budget.adsByPlatform.map((a, j) => j === i ? { ...a, ...patch } : a) } }));
  const addAds = () => setBrief((b) => ({ ...b, budget: { ...b.budget, adsByPlatform: [...b.budget.adsByPlatform, { platform: ADS_PLATFORMS[0], amount: 0 }] } }));
  const rmAds = (i: number) => setBrief((b) => ({ ...b, budget: { ...b.budget, adsByPlatform: b.budget.adsByPlatform.filter((_, j) => j !== i) } }));
  const kolBudget = kolBudgetTotal(brief);
  const otherBuckets: [string, keyof CampaignBrief["budget"]][] = [
    ["Graphic / Production", "graphic"], ["Printing / POSM", "printing"], ["CRM / LINE OA", "crm"], ["Other", "other"],
  ];

  return (
    <>
      <Panel title="Budget Allocation" hint="ใส่งบรวมแล้วเกลี่ยไปแต่ละส่วน — KOL Budget sync จาก KOL Plan (แก้ไม่ได้ตรงนี้)">
        <div className="mb-4">
          <label className={label}>Total Campaign Budget <span className="text-faint font-normal">· รวม KOL อัตโนมัติ</span></label>
          <input value={brief.budget.total || ""} onChange={(e) => setB({ total: num(e.target.value) })} className={`${field} max-w-[260px]`} placeholder="฿" />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {/* KOL — read-only, synced */}
          <div>
            <label className={label}>KOL Budget <span className="text-faint font-normal">· auto</span></label>
            <div className="flex items-center gap-2">
              <input value={baht(kolBudget)} readOnly disabled className={`${field} bg-line4 cursor-not-allowed opacity-80`} />
            </div>
            <button onClick={onEditKol} className="mt-[6px] text-[11.5px] font-bold text-accent">Edit in KOL Plan →</button>
          </div>
          {otherBuckets.map(([lbl, key]) => (
            <div key={key}><label className={label}>{lbl}</label><input value={(brief.budget[key] as number) || ""} onChange={(e) => setB({ [key]: num(e.target.value) } as Partial<CampaignBrief["budget"]>)} className={field} placeholder="฿" /></div>
          ))}
        </div>

        {/* Ads Budget total sits right next to its per-platform breakdown */}
        <div className="mt-5 rounded-[12px] border border-line2 p-4" style={{ background: "#FBF9F4" }}>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <label className={label}>Ads Budget (total)</label>
              <input value={brief.budget.ads || ""} onChange={(e) => setB({ ads: num(e.target.value) })} className={`${field} max-w-[220px]`} placeholder="฿" />
            </div>
            <div className="text-[12px] font-semibold" style={{ color: bs.adsMismatch ? "#B33A2E" : "#4E7A4E" }}>
              รวมตาม platform: {baht(bs.adsAllocated, { compact: true })}{bs.adsMismatch ? " ⚠ ไม่ตรงกับงบรวม" : " ✓"}
            </div>
          </div>
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
            ["Total", baht(Math.max(brief.budget.total, bs.allocated), { compact: true }), "#211F1C"],
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
    <Panel title="Auto Task Preview" hint={`ระบบจะสร้างงานเหล่านี้ให้อัตโนมัติเมื่อกด Submit — รวม ${total} รายการ (ตรงกับที่สร้างจริง)`}>
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
function Submit({ brief, errors, warnings, ack, onAck, checklist }: {
  brief: CampaignBrief; errors: string[]; warnings: string[]; ack: boolean; onAck: (v: boolean) => void; checklist: GuidelineItem[];
}) {
  const must = checklist.filter((c) => c.must);
  const mustDone = must.filter((c) => c.done).length;
  return (
    <Panel title="Review & Submit" hint="Submit ต้องกรอก required field ครบ และไม่มี warning ค้าง — Save Draft เก็บไว้แก้ต่อได้แม้ยังไม่ครบ">
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {[
          ["Campaign", brief.name || "—"], ["Brand", brandName(brief.b)], ["Type / Objective", `${brief.campaignType} · ${brief.objective}`],
          ["Branches", brief.branches.join(", ") || "—"], ["Period", `${brief.startDate || "—"} → ${brief.endDate || "—"}`],
          ["Launch", brief.launchDate || "—"], ["Priority", brief.priority], ["Content items", String(brief.content.length)],
          ["KOL requirements", String(brief.kols.length)], ["Total budget", baht(brief.budget.total, { compact: true })],
          ["Approver", brief.approver || "—"], ["Guideline (must-have)", `${mustDone}/${must.length}`],
        ].map(([l, v]) => (
          <div key={l} className="flex items-center justify-between border-b border-line4 py-2">
            <span className="text-[12px] text-faint font-semibold">{l}</span><span className="text-[13px] font-bold text-ink text-right">{v}</span>
          </div>
        ))}
      </div>

      {errors.length > 0 ? (
        <div className="rounded-card px-4 py-3" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
          <div className="text-[12.5px] font-bold text-status-red mb-2">ต้องแก้ {errors.length} จุดก่อน Submit Campaign:</div>
          <ul className="flex flex-col gap-[5px]">
            {errors.map((e, i) => <li key={i} className="text-[12.5px] text-status-red flex items-start gap-2"><span>•</span><span>{e}</span></li>)}
          </ul>
        </div>
      ) : warnings.length > 0 ? (
        <div className="rounded-card px-4 py-3" style={{ background: "#FBF6ED", border: "1px solid #EDCC7A" }}>
          <div className="text-[12.5px] font-bold mb-2" style={{ color: "#8A6D1E" }}>⚠ มี {warnings.length} warning ที่ยังไม่ได้แก้ — ตรวจสอบก่อน Submit:</div>
          <ul className="flex flex-col gap-[5px] mb-3">
            {warnings.map((w, i) => <li key={i} className="text-[12.5px] flex items-start gap-2" style={{ color: "#8A6D1E" }}><span>•</span><span>{w}</span></li>)}
          </ul>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold cursor-pointer" style={{ color: "#8A6D1E" }}>
            <input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} /> รับทราบ warning เหล่านี้และยืนยัน Submit ต่อ
          </label>
        </div>
      ) : (
        <div className="rounded-card px-4 py-3 text-[12.5px] font-bold" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>✓ ครบทุก required field และไม่มี warning ค้าง — พร้อม Submit Campaign</div>
      )}
    </Panel>
  );
}
