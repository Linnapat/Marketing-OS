"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { REQUESTS, RequestRow, APPROVAL_STAGES, STAGE_TONE, PRIORITY_TONE } from "@/lib/data/requests";
import { fetchRequests, updateRequestStage } from "@/lib/db/requests";

export default function ApprovalQueuePage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [requests, setRequests] = useState<RequestRow[]>(REQUESTS);

  useEffect(() => {
    let alive = true;
    fetchRequests().then((r) => { if (alive) setRequests(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const moveStage = (id: string, dir: 1 | -1) => {
    setRequests((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const idx = APPROVAL_STAGES.indexOf(r.stage);
      const stage = APPROVAL_STAGES[Math.max(0, Math.min(APPROVAL_STAGES.length - 1, idx + dir))];
      updateRequestStage(id, stage);
      return { ...r, stage };
    }));
  };

  const rows = requests.filter((r) => brand === "all" || r.b === brand);

  return (
    <>
      <PageHeader eyebrow="Approval Queue" title="Approval Queue" subtitle={`${rows.length} items across the 9-stage pipeline — Draft → Reported`} />

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      <div className="mt-5">
        {view === "board" ? (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {APPROVAL_STAGES.map((stage) => {
              const items = rows.filter((r) => r.stage === stage);
              return (
                <div key={stage} className="flex-shrink-0 w-[250px]">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <StatusBadge tone={STAGE_TONE[stage] ?? "neutral"}>{stage}</StatusBadge>
                    <span className="text-[12px] text-faint font-semibold">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((r) => (
                      <div key={r.id} className="bg-surface border border-line rounded-card p-[13px]">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[13px] font-bold leading-tight">{r.typeIcon} {r.title}</span>
                          <StatusBadge tone={PRIORITY_TONE[r.priority]}>{r.priority}</StatusBadge>
                        </div>
                        <div className="text-[11px] text-faint flex items-center gap-[5px] mb-1"><BrandDot brand={r.b} size={6} />{brandName(r.b)} · {r.campaign}</div>
                        <div className="flex items-center justify-between text-[11px] text-faint">
                          <span>{r.requester} → {r.approver}</span><span>{r.due}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-line4">
                          <button onClick={() => moveStage(r.id, -1)} disabled={APPROVAL_STAGES.indexOf(r.stage) === 0}
                            className="text-[11px] font-bold text-muted border border-line2 rounded-[7px] px-2 py-[3px] bg-white disabled:opacity-30 disabled:cursor-default">← Back</button>
                          <button onClick={() => moveStage(r.id, 1)} disabled={APPROVAL_STAGES.indexOf(r.stage) === APPROVAL_STAGES.length - 1}
                            className="text-[11px] font-bold text-white bg-panel rounded-[7px] px-2 py-[3px] disabled:opacity-30 disabled:cursor-default ml-auto">Advance →</button>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-[11px] text-faint text-center py-4 border border-dashed border-line2 rounded-card">Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: "2fr 1.3fr 1fr 1fr 0.7fr 1.1fr" }}>
              <div>Request</div><div>Campaign</div><div>Requester</div><div>Approver</div><div>Due</div><div>Stage</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1fr_1fr_0.7fr_1.1fr] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0">
                <div><div className="text-[13px] font-bold">{r.typeIcon} {r.title}</div><div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={r.b} size={6} />{brandName(r.b)}</div></div>
                <span className="text-[12px] text-muted truncate">{r.campaign}</span>
                <span className="text-[12px] text-muted">{r.requester}</span>
                <span className="text-[12px] text-muted">{r.approver}</span>
                <span className="text-[12px] text-muted">{r.due}</span>
                <div><StatusBadge tone={STAGE_TONE[r.stage] ?? "neutral"}>{r.stage}</StatusBadge></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
