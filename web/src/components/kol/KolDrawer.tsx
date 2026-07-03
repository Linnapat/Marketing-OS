"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  Kol, KOL_COMMENTS, DELIVERABLES, initials, fmtFollow,
} from "@/lib/data/kol";
import { brandName, brandColor } from "@/lib/brands";
import { platformIcon } from "@/lib/platforms";
import { kolTone } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { baht } from "@/lib/format";

const TABS = [
  ["profile", "Profile"], ["campaign", "Campaign"], ["deliverables", "Deliverables"],
  ["brief", "Brief & Assets"], ["contract", "Contract"], ["results", "Results"], ["comments", "Comments"],
] as const;
type DrawerTab = (typeof TABS)[number][0];

export function KolDrawer({ kol, initialTab = "profile", onClose }: { kol: Kol; initialTab?: DrawerTab; onClose: () => void }) {
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
                <div className="text-[12px] text-white/50">{kol.h} · {brandName(kol.b)} · {kol.campaign}</div>
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
          {tab === "profile" && <ProfileTab kol={kol} />}
          {tab === "campaign" && <CampaignTab kol={kol} />}
          {tab === "deliverables" && <DeliverablesTab items={deliverables} />}
          {tab === "brief" && <BriefTab kol={kol} />}
          {tab === "contract" && <ContractTab kol={kol} />}
          {tab === "results" && <ResultsTab kol={kol} />}
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

function ProfileTab({ kol }: { kol: Kol }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="KOL Type" value={kol.kolType} />
      <Field label="Followers" value={fmtFollow(kol.followers)} />
      <Field label="Avg Reach" value={fmtFollow(kol.expectedReach)} />
      <Field label="Audience Fit" value={kol.audienceFit} />
      <div className="col-span-2"><Field label="Content Style" value={kol.contentStyle} /></div>
      <div className="col-span-2"><Field label="Past Collaboration" value={kol.pastCollab} /></div>
      <div className="col-span-2"><Field label="Contact / Agency" value={kol.contactInfo} /></div>
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

function ResultsTab({ kol }: { kol: Kol }) {
  if (!kol.postLink && kol.actualReach === 0) return <Empty note="No results yet — fill in once the KOL has posted." />;
  const cpv = kol.visits ? Math.round(kol.totalCost / kol.visits) : 0;
  const kpis = [
    ["Reach", fmtFollow(kol.actualReach)], ["Engagement", kol.engagement], ["Saves", kol.saves],
    ["Shares", kol.shares], ["Visits", String(kol.visits)], ["CPV", cpv ? baht(cpv) : "—"],
    ["ROI", kol.roi ? `${kol.roi}×` : "—"], ["Posted", kol.postedDate ?? "—"],
  ];
  return (
    <div className="flex flex-col gap-4">
      {kol.postLink && (
        <div className="bg-surface border border-line rounded-card px-4 py-3 flex items-center justify-between">
          <span className="text-[12px] text-muted truncate">{kol.postLink}</span>
          <span className="text-[12px] text-accent font-semibold cursor-pointer flex-shrink-0">Open post ↗</span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(([label, val]) => (
          <div key={label} className="bg-surface border border-line rounded-card p-3">
            <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{label}</div>
            <div className="text-[15px] font-bold text-ink">{val}</div>
          </div>
        ))}
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
