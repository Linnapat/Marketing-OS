"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  Kol, KOL_COMMENTS, DELIVERABLES, initials, fmtFollow,
} from "@/lib/data/kol";
import { brandName, brandColor } from "@/lib/brands";
import { platformIcon, channelUrl } from "@/lib/platforms";
import { kolTone } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { baht } from "@/lib/format";
import { updateKol } from "@/lib/db/kol";
import { logCollaboration, ensureKolProfile } from "@/lib/db/kolMaster";

const TABS = [
  ["profile", "Profile"], ["campaign", "Campaign"], ["deliverables", "Deliverables"],
  ["brief", "Brief & Assets"], ["contract", "Contract"], ["results", "Results"], ["comments", "Comments"],
] as const;
type DrawerTab = (typeof TABS)[number][0];

export function KolDrawer({ kol, initialTab = "profile", onClose, onUpdate }: { kol: Kol; initialTab?: DrawerTab; onClose: () => void; onUpdate?: (k: Kol) => void }) {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [comments, setComments] = useState(() => KOL_COMMENTS.filter((c) => c.kolId === kol.id));
  const deliverables = DELIVERABLES.filter((d) => d.kolId === kol.id);
  const pi = platformIcon(kol.plat);
  const openCount = comments.filter((c) => c.status === "Open").length;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[560px] bg-ivory shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-panel text-white px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-extrabold text-white" style={{ background: brandColor(kol.b) }}>
                {initials(kol.name)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-extrabold">{kol.name}</span>
                  <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[9px] font-bold" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                </div>
                <div className="text-[12px] text-white/50">
                  {channelUrl(kol.plat, kol.h)
                    ? <a href={channelUrl(kol.plat, kol.h)!} target="_blank" rel="noreferrer" className="text-white/80 font-semibold hover:underline">{kol.h} ↗</a>
                    : kol.h} · {brandName(kol.b)} · {kol.campaign}</div>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white"><X size={20} /></button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <StatusBadge tone={kolTone(kol.status)}>{kol.status}</StatusBadge>
            <span className="text-[11px] text-white/60">Owner {kol.owner}</span>
            {kol.pendingApprover !== "—" && <span className="text-[11px] text-white/60">· Approver {kol.pendingApprover}</span>}
            <span className="text-[11px] text-white/60">· Due {kol.postDueDate}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 overflow-x-auto border-b border-line bg-surface">
          {TABS.map(([id, label]) => {
            const active = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="text-[12.5px] font-semibold px-[11px] py-[10px] whitespace-nowrap border-b-2 -mb-[1px] flex items-center gap-[6px]"
                style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
                {label}
                {id === "comments" && openCount > 0 && <span className="text-[9.5px] font-bold px-[6px] rounded-pill bg-status-red text-white">{openCount}</span>}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "profile" && <ProfileTab kol={kol} onUpdate={onUpdate} />}
          {tab === "campaign" && <CampaignTab kol={kol} />}
          {tab === "deliverables" && <DeliverablesTab items={deliverables} />}
          {tab === "brief" && <BriefTab kol={kol} />}
          {tab === "contract" && <ContractTab kol={kol} />}
          {tab === "results" && <ResultsTab kol={kol} onUpdate={onUpdate} />}
          {tab === "comments" && <CommentsTab comments={comments} onResolve={(id) => setComments((cs) => cs.map((c) => c.id === id ? { ...c, status: "Resolved" } : c))} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[3px]">{label}</div>
      <div className="text-[13.5px] text-ink">{value}</div>
    </div>
  );
}

function ProfileTab({ kol, onUpdate }: { kol: Kol; onUpdate?: (k: Kol) => void }) {
  const [name, setName] = useState(kol.name);
  const [handle, setHandle] = useState(kol.h);
  const [kolType, setKolType] = useState(kol.kolType);
  const [followers, setFollowers] = useState(kol.followers || 0);
  const [avgReach, setAvgReach] = useState(kol.expectedReach || 0);
  const [audienceFit, setAudienceFit] = useState(kol.audienceFit);
  const [contentStyle, setContentStyle] = useState(kol.contentStyle);
  const [pastCollab, setPastCollab] = useState(kol.pastCollab);
  const [contactInfo, setContactInfo] = useState(kol.contactInfo);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name !== kol.name || handle !== kol.h || kolType !== kol.kolType || followers !== (kol.followers || 0)
    || avgReach !== (kol.expectedReach || 0) || audienceFit !== kol.audienceFit || contentStyle !== kol.contentStyle
    || pastCollab !== kol.pastCollab || contactInfo !== kol.contactInfo;

  const save = async () => {
    setBusy(true);
    // Once the specialist fills the real page, upsert it into the master library.
    const masterKolId = await ensureKolProfile({ masterKolId: kol.masterKolId, name, handle, kolType, followers, platform: kol.plat }).catch(() => kol.masterKolId);
    const next: Kol = { ...kol, name: name.trim() || kol.name, h: handle.trim() || kol.h, kolType, followers, expectedReach: avgReach, audienceFit, contentStyle, pastCollab, contactInfo, masterKolId: masterKolId ?? kol.masterKolId };
    try { await updateKol(next); onUpdate?.(next); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setBusy(false); }
  };

  const field = "w-full text-[13.5px] px-[12px] py-[9px] rounded-[9px] border border-line2 bg-ivory outline-none";
  const lbl = "block text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]";
  const AUDIENCE = ["Very High", "High", "Medium", "Low", "TBD"];
  const audienceOptions = AUDIENCE.includes(audienceFit) ? AUDIENCE : [audienceFit, ...AUDIENCE];
  return (
    <div className="flex flex-col gap-4">
      {kol.masterKolId && <div className="text-[11px] font-semibold text-status-green">✓ In KOL Database</div>}
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>KOL / Page Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="e.g. Tokyo Tom" /></div>
        <div><label className={lbl}>Page / Handle</label><input value={handle} onChange={(e) => setHandle(e.target.value)} className={field} placeholder="@handle or URL" /></div>
        <div><label className={lbl}>KOL Type</label><input value={kolType} onChange={(e) => setKolType(e.target.value)} className={field} placeholder="e.g. Food Blogger" /></div>
        <div><label className={lbl}>Followers</label><input type="number" value={followers || ""} onChange={(e) => setFollowers(parseInt(e.target.value) || 0)} className={field} placeholder="0" /></div>
        <div><label className={lbl}>Avg Reach</label><input type="number" value={avgReach || ""} onChange={(e) => setAvgReach(parseInt(e.target.value) || 0)} className={field} placeholder="0" /></div>
        <div><label className={lbl}>Audience Fit</label><select value={audienceFit} onChange={(e) => setAudienceFit(e.target.value)} className={field}>{audienceOptions.map((a) => <option key={a}>{a}</option>)}</select></div>
      </div>
      <div><label className={lbl}>Content Style</label><input value={contentStyle} onChange={(e) => setContentStyle(e.target.value)} className={field} placeholder="e.g. Food photography + short video" /></div>
      <div><label className={lbl}>Past Collaboration</label><input value={pastCollab} onChange={(e) => setPastCollab(e.target.value)} className={field} placeholder="e.g. Wagyu teaser Jun 2025 — 3.8× ROI" /></div>
      <div><label className={lbl}>Contact / Agency</label><input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} className={field} placeholder="Agency / email / phone" /></div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !dirty} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[10px] disabled:opacity-50">{busy ? "Saving…" : "Save Profile"}</button>
        {saved && <span className="text-[12.5px] font-semibold text-status-green">✓ Saved</span>}
      </div>
    </div>
  );
}

function CampaignTab({ kol }: { kol: Kol }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Campaign" value={kol.campaign} />
      <Field label="Branch / Store" value={kol.branch} />
      <Field label="Objective" value={kol.objective} />
      <Field label="Target Audience" value={kol.target} />
      <div className="col-span-2"><Field label="Key Message" value={kol.keyMsg} /></div>
      <div className="col-span-2"><Field label="Offer" value={kol.offer} /></div>
      <Field label="Posting Period" value={kol.postingPeriod} />
      <Field label="Coupon Code" value={kol.couponCode ?? "—"} />
    </div>
  );
}

function DeliverablesTab({ items }: { items: typeof DELIVERABLES }) {
  if (!items.length) return <Empty note="No deliverables defined yet." />;
  return (
    <div className="flex flex-col gap-3">
      {items.map((d) => (
        <div key={d.id} className="bg-surface border border-line rounded-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-bold text-ink">{d.type}</div>
            <StatusBadge tone={kolTone(d.status)}>{d.status}</StatusBadge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-[11.5px] text-faint flex-wrap">
            <span>{d.platform}</span><span>Qty {d.qty}</span><span>Due {d.due}</span>
            {d.pendingApprover && d.pendingApprover !== "—" && <span>Approver {d.pendingApprover}</span>}
            {d.openComments > 0 && <span className="text-status-red font-semibold">💬 {d.openComments}</span>}
          </div>
          <div className="flex items-center gap-3 mt-2">
            {d.draftLink && <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Draft ↗</span>}
            {d.finalPostLink && <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Final post ↗</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function BriefTab({ kol }: { kol: Kol }) {
  const links = [
    ["Brief link", "#brief"], ["Asset folder", "#assets"], ["Draft content", kol.stages.find((s) => s.l === "Create")?.done ? "#draft" : null],
    ["Caption / script", "#caption"], ["Final post link", kol.postLink], ["UTM link", kol.couponCode ? "#utm" : null],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      {links.map(([label, href]) => (
        <div key={label} className="flex items-center justify-between bg-surface border border-line rounded-card px-4 py-3">
          <span className="text-[13px] text-ink">{label}</span>
          {href ? <span className="text-[12px] text-accent font-semibold cursor-pointer">Open ↗</span> : <span className="text-[12px] text-faint">Not added</span>}
        </div>
      ))}
    </div>
  );
}

function ContractTab({ kol }: { kol: Kol }) {
  const rows: [string, string][] = [
    ["Contract", kol.contractStatus], ["Quotation", kol.quotationStatus], ["Invoice", kol.invoiceStatus], ["Payment", kol.paymentStatus],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-accent-soft border border-accent-border rounded-card p-3 text-[11.5px] text-status-gold">
        Finance status is read-only here — linked from request <b>{kol.financeReqId}</b>. Manage payment in the Finance module.
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between bg-surface border border-line rounded-card px-4 py-3">
            <span className="text-[13px] text-ink">{k}</span>
            <StatusBadge tone={kolTone(v)}>{v}</StatusBadge>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fee" value={baht(kol.fee, { compact: true })} />
        <Field label="Food Support" value={baht(kol.foodCost, { compact: true })} />
        <Field label="Total Cost" value={baht(kol.totalCost, { compact: true })} />
      </div>
      <Field label="Payment Due" value={kol.paymentDue} />
    </div>
  );
}

function ResultsTab({ kol, onUpdate }: { kol: Kol; onUpdate?: (k: Kol) => void }) {
  const [reach, setReach] = useState(kol.actualReach || 0);
  const [eng, setEng] = useState(kol.actualEngagement || 0);
  const [link, setLink] = useState(kol.postLink ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // "Log to master" — extra fields the collaboration-history record needs.
  const [onTime, setOnTime] = useState(true);
  const [feedback, setFeedback] = useState(0); // 0 = not rated
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  const logToMaster = async () => {
    if (!kol.masterKolId) return;
    setLogging(true);
    try {
      await logCollaboration({
        kol_id: kol.masterKolId,
        brand: kol.b,
        fee_paid: kol.fee || undefined,
        deliverables: kol.contentStyle || undefined,
        actual_reach: reach || undefined,
        actual_engagement: eng || undefined,
        roas: kol.roi || undefined,
        on_time_delivery: onTime,
        brand_feedback_score: feedback || undefined,
      });
      setLogged(true); setTimeout(() => setLogged(false), 2500);
    } finally { setLogging(false); }
  };

  // Cost efficiency auto-derives from the entered actuals + the total cost.
  const costPerReach = reach ? kol.totalCost / reach : 0;
  const costPerEng = eng ? kol.totalCost / eng : 0;
  const cpv = kol.visits ? Math.round(kol.totalCost / kol.visits) : 0;
  // Engagement rate: engagement ÷ reach, falling back to followers. Always %.
  const engBase = reach > 0 ? reach : (kol.followers || 0);
  const engRate = engBase ? (eng / engBase) * 100 : 0;

  const save = async () => {
    setBusy(true);
    const next: Kol = {
      ...kol, actualReach: reach, actualEngagement: eng,
      engagement: eng ? fmtFollow(eng) : kol.engagement,
      postLink: link.trim() || null,
      status: reach > 0 ? "Posted" : kol.status,
    };
    try { await updateKol(next); onUpdate?.(next); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setBusy(false); }
  };

  const field = "w-full text-[13.5px] px-[12px] py-[9px] rounded-[9px] border border-line2 bg-ivory outline-none";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-faint mb-[5px]">Actual Reach</label>
          <input type="number" value={reach || ""} onChange={(e) => setReach(parseInt(e.target.value) || 0)} className={field} placeholder="0" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-faint mb-[5px]">Actual Engagement</label>
          <input type="number" value={eng || ""} onChange={(e) => setEng(parseInt(e.target.value) || 0)} className={field} placeholder="0" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-faint mb-[5px]">Result / Post Link</label>
        <input value={link} onChange={(e) => setLink(e.target.value)} className={field} placeholder="https://…" />
      </div>

      {/* Auto-derived cost efficiency */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Reach", fmtFollow(reach)], ["Engagement", eng ? fmtFollow(eng) : "—"],
          ["Eng. Rate", engBase ? `${engRate.toFixed(2)}%` : "—"],
          ["Cost / Reach", costPerReach ? baht(Math.round(costPerReach * 100) / 100) : "—"],
          ["Cost / Eng.", costPerEng ? baht(Math.round(costPerEng * 100) / 100) : "—"],
          ["Visits", String(kol.visits)], ["CPV", cpv ? baht(cpv) : "—"],
          ["ROI", kol.roi ? `${kol.roi}×` : "—"], ["Posted", kol.postedDate ?? "—"],
        ].map(([label, val]) => (
          <div key={label} className="bg-surface border border-line rounded-card p-3">
            <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{label}</div>
            <div className="text-[15px] font-bold text-ink">{val}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[10px] disabled:opacity-50">
          {busy ? "Saving…" : "Save Results"}
        </button>
        {saved && <span className="text-[12.5px] font-semibold text-status-green">✓ Saved</span>}
      </div>

      {/* Log to master database — records a collaboration and recomputes rank. */}
      <div className="border-t border-line pt-4 mt-1">
        <div className="text-[12.5px] font-extrabold text-ink mb-1">Log to master database</div>
        <div className="text-[11.5px] text-faint mb-3">บันทึกผลงานจริงเข้าประวัติของ KOL รายนี้ แล้วคำนวณ Rank ใหม่ (ใช้ตอนเลือกครั้งต่อไป)</div>
        {kol.masterKolId ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-bold text-faint mb-[5px]">On-time delivery</label>
                <select value={onTime ? "yes" : "no"} onChange={(e) => setOnTime(e.target.value === "yes")} className={field}>
                  <option value="yes">ตรงเวลา</option>
                  <option value="no">ล่าช้า</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-faint mb-[5px]">Brand feedback (1–5)</label>
                <select value={feedback} onChange={(e) => setFeedback(parseInt(e.target.value))} className={field}>
                  <option value={0}>ยังไม่ให้คะแนน</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"⭐️".repeat(n)} ({n})</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={logToMaster} disabled={logging} className="text-[13px] font-bold text-panel border border-panel rounded-[10px] px-5 py-[10px] disabled:opacity-50">
                {logging ? "Logging…" : "Log & recompute rank"}
              </button>
              {logged && <span className="text-[12.5px] font-semibold text-status-green">✓ Logged · rank updated</span>}
            </div>
          </>
        ) : (
          <div className="text-[11.5px] text-faint bg-surface border border-line rounded-card p-3">
            KOL รายนี้ยังไม่ได้เชื่อมกับ master profile — สร้างผ่านฟอร์ม Request KOL (ค้นหา/สร้างใหม่) เพื่อให้บันทึกประวัติได้
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsTab({ comments, onResolve }: { comments: typeof KOL_COMMENTS; onResolve: (id: number) => void }) {
  if (!comments.length) return <Empty note="No comments yet." />;
  return (
    <div className="flex flex-col gap-3">
      {comments.map((c) => (
        <div key={c.id} className="bg-surface border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.ownerColor }}>{initials(c.owner)}</span>
            <span className="text-[12.5px] font-bold text-ink">{c.owner}</span>
            <span className="text-[10.5px] text-faint">{c.ownerTeam} · {c.createdAt}</span>
            <StatusBadge tone={kolTone(c.status)} className="ml-auto">{c.status}</StatusBadge>
          </div>
          <div className="text-[12.5px] text-muted leading-[1.5]">{c.text}</div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-faint">
            <span className="px-[7px] py-[1px] rounded-pill bg-ivory border border-line3">{c.type}</span>
            <span>→ {c.assignedTo}</span>
            {c.due && <span>Due {c.due}</span>}
            {c.status === "Open" && (
              <button onClick={() => onResolve(c.id)} className="ml-auto text-[11px] font-bold text-status-green">Resolve ✓</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ note }: { note: string }) {
  return <div className="text-[13px] text-faint text-center py-10">{note}</div>;
}
