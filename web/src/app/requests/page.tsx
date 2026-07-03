"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { CAMPAIGNS } from "@/lib/data/campaigns";
import { REQUEST_TYPES, REQUESTS, RequestRow, STAGE_TONE, PRIORITY_TONE } from "@/lib/data/requests";
import { fetchRequests, createRequest } from "@/lib/db/requests";

const REQ_BRAND_TO_ID: Record<string, BrandId> = { TEPPEN: "teppen", "Omakase Don": "omakase", Mainichi: "mainichi", Touka: "touka" };

export default function RequestCenterPage() {
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [type, setType] = useState("graphic");
  const [title, setTitle] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>(REQUESTS);
  const [fBrand, setFBrand] = useState("TEPPEN");
  const [fCampaign, setFCampaign] = useState(CAMPAIGNS[0]?.name ?? "");
  const [fPriority, setFPriority] = useState("High");
  const [fDue, setFDue] = useState("");
  const [fApprover, setFApprover] = useState("");

  useEffect(() => {
    let alive = true;
    fetchRequests().then((r) => { if (alive) setRequests(r); }).catch(() => {});
    return () => { alive = false; };
  }, [submitted]);

  const submit = async () => {
    const rt = REQUEST_TYPES.find((t) => t.key === type);
    const id = `REQ-${1000 + Math.floor(Math.random() * 9000)}`;
    const row: RequestRow = {
      id, type: rt?.label ?? "Request", typeIcon: rt?.icon ?? "📌", title: title.trim(),
      b: REQ_BRAND_TO_ID[fBrand] ?? "teppen", campaign: fCampaign, requester: "You",
      approver: fApprover.trim() || "Aran P.", due: fDue.trim() || "TBD", stage: "Submitted", priority: fPriority as RequestRow["priority"],
    };
    await createRequest(row);
    setSubmitted(id);
  };

  const rows = requests.filter((r) => brand === "all" || r.b === brand);
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";

  return (
    <>
      <PageHeader eyebrow="Request Center" title="Request Center" subtitle="One place to request Graphic, Content, KOL, Budget, Photo, Report, and more — all linked to a campaign." />

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Form */}
        <div className="bg-surface border border-line rounded-cardLg p-5">
          {submitted ? (
            <div className="text-center py-8">
              <div className="text-[40px] mb-2">✓</div>
              <div className="text-[16px] font-bold">Request submitted</div>
              <div className="text-[13px] text-faint mt-1">Reference <b className="text-ink">{submitted}</b> — routed to the approval queue.</div>
              <button onClick={() => { setSubmitted(null); setTitle(""); }} className="mt-5 text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">New Request</button>
            </div>
          ) : (
            <>
              <div className="text-[13px] font-bold mb-4">New Request</div>
              <div className="mb-4">
                <label className="block text-[11.5px] font-bold text-faint mb-2">Request type</label>
                <div className="flex flex-wrap gap-2">
                  {REQUEST_TYPES.map((rt) => {
                    const active = rt.key === type;
                    return (
                      <button key={rt.key} onClick={() => setType(rt.key)} className="flex items-center gap-[6px] text-[12px] px-[12px] py-[7px] rounded-pill"
                        style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>
                        <span>{rt.icon}</span>{rt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Title <span className="text-status-red">*</span></label><input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Wagyu key visual for launch" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={fBrand} onChange={(e) => setFBrand(e.target.value)} className={field}><option>TEPPEN</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option></select></div>
                  <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label><select value={fCampaign} onChange={(e) => setFCampaign(e.target.value)} className={field}>{CAMPAIGNS.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Priority</label><select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={field}><option>High</option><option>Med</option><option>Low</option></select></div>
                  <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Due</label><input value={fDue} onChange={(e) => setFDue(e.target.value)} className={field} placeholder="Jul 5" /></div>
                  <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Approver</label><input value={fApprover} onChange={(e) => setFApprover(e.target.value)} className={field} placeholder="Aran P." /></div>
                </div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Notes / brief</label><textarea rows={3} className={field} placeholder="What's needed, references, deliverables…" /></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Attachment</label><div className="border-2 border-dashed border-line2 rounded-[10px] py-5 text-center text-[12px] text-faint">Drop reference file</div></div>
                <button onClick={submit} disabled={!title.trim()} className="text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Submit Request</button>
              </div>
            </>
          )}
        </div>

        {/* Recent requests */}
        <div className="flex flex-col gap-3">
          <div className="text-[15px] font-bold">Recent Requests</div>
          <BrandFilter value={brand} onChange={setBrand} label="" />
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="bg-surface border border-line rounded-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px]">{r.typeIcon}</span>
                  <span className="text-[13.5px] font-bold truncate">{r.title}</span>
                  <StatusBadge tone={STAGE_TONE[r.stage] ?? "neutral"} className="ml-auto">{r.stage}</StatusBadge>
                </div>
                <div className="flex items-center gap-2 text-[11.5px] text-faint flex-wrap">
                  <span className="flex items-center gap-[5px]"><BrandDot brand={r.b} size={6} />{brandName(r.b)}</span>
                  <span>·</span><span>{r.campaign}</span><span>·</span><span>due {r.due}</span>
                  <StatusBadge tone={PRIORITY_TONE[r.priority]}>{r.priority}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
