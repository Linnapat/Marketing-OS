"use client";

// Artwork Count — how many pieces of artwork each designer got approved in a
// month. Built for checking an outsourced studio's invoice, so it shows the
// pieces themselves, not just a total: every number can be opened and read.
//
// The counting rules live in lib/data/artworkReport (and are unit-tested).
// This page only picks a month and renders.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CampaignCommandBar, CampaignPageHeaderSection, ModuleSummaryCard } from "@/components/campaign/CampaignHeadController";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { BrandDot } from "@/components/ui/BrandDot";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { fetchGraphics } from "@/lib/db/graphic";
import { Graphic, WORK_KIND_LABEL, WorkKind } from "@/lib/data/graphic";
import { artworkReport, artworkTotals, artworkMonths, ArtworkPiece, creativeWorkload, revisionRate, WorkloadRow, DUE_SOON_DAYS } from "@/lib/data/artworkReport";
import { todayIso } from "@/lib/data/brief";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm ? `${MON[mm - 1]} ${y}` : m;
};
const dayLabel = (iso: string) => {
  const [, m, d] = (iso.slice(0, 10)).split("-").map(Number);
  return m ? `${MON[m - 1]} ${d}` : "";
};

const field = "text-[13px] px-[12px] py-[8px] rounded-[10px] border border-line2 bg-ivory outline-none";

export default function ArtworkCountPage() {
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [open, setOpen] = useState<string | null>(null);
  const visibility = useBrandVisibility();

  useEffect(() => {
    let alive = true;
    fetchGraphics()
      .then((g) => { if (alive) { setGraphics(g); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const report = useMemo(() => artworkReport(graphics), [graphics]);
  const visible = useMemo(
    () => report.pieces.filter((p) => visibility.isVisible(p.b) && (brand === "all" || p.b === brand)),
    [report.pieces, visibility, brand],
  );
  const months = useMemo(() => artworkMonths(visible), [visible]);

  // Default to the newest month that actually has work in it.
  useEffect(() => {
    if (!month && months.length) setMonth(months[0]);
  }, [months, month]);

  const inMonth = useMemo(() => visible.filter((p) => p.month === month), [visible, month]);
  const totals = useMemo(() => artworkTotals(inMonth), [inMonth]);
  const undated = useMemo(
    () => report.undated.filter((p) => visibility.isVisible(p.b) && (brand === "all" || p.b === brand)),
    [report.undated, visibility, brand],
  );

  const totalPieces = inMonth.length;
  const totalRequests = new Set(inMonth.map((p) => p.requestId)).size;
  // The one-line answer to "ทีม Creative ทำกราฟฟิคกับวิดีโอไปเท่าไร": pieces per
  // kind, before the per-designer breakdown below. VDO splits the way the team
  // prices it: งานถ่าย is a shoot day (คิว), งานตัด is an edited clip (คลิป).
  const kindCount = (kinds: WorkKind[]) => inMonth.filter((p) => kinds.includes(p.kind)).length;
  const graphicPieces = kindCount(["graphic"]);
  const editPieces = kindCount(["vdo"]);
  const vdoShoots = kindCount(["vdo_shoot"]);
  const photoShoots = kindCount(["photo_shoot"]);
  const revRate = revisionRate(inMonth);

  const visibleGraphics = useMemo(
    () => graphics.filter((g) => visibility.isVisible(g.b) && (brand === "all" || g.b === brand)),
    [graphics, visibility, brand],
  );
  const workload = useMemo(() => creativeWorkload(visibleGraphics, todayIso()), [visibleGraphics]);
  const openTotal = workload.reduce((sum, w) => sum + w.inProgress + w.waitingReview + w.revision, 0);
  const mixLabel = (w: WorkloadRow) =>
    (Object.entries(w.mix) as [WorkKind, number][]).map(([k, n]) => `${n} ${WORK_KIND_LABEL[k]}`).join(" · ");

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="CREATIVE KITCHEN"
        title="Artwork Count"
        description="จำนวนชิ้นงานที่อนุมัติแล้วในแต่ละเดือน แยกตามคนทำ — สำหรับตรวจกับใบวางบิลของ outsource"
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#9D96AC]">เดือนที่อนุมัติ</div>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={field} disabled={!months.length}>
                {months.length === 0 && <option value="">— ยังไม่มีงานที่อนุมัติ —</option>}
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            {/* BrandFilter renders its own "Brand" label — don't add a second one. */}
            <BrandFilter value={brand} onChange={setBrand} />
            <Link href="/graphic" className="ml-auto text-[12.5px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">
              ← Creative Kitchen
            </Link>
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard title={`สรุป ${month ? monthLabel(month) : ""}`}>
          <div className="flex flex-wrap gap-3">
            <Stat label="🎨 Graphic" value={graphicPieces} note="ชิ้น" />
            <Stat label="🎥 VDO · งานถ่าย" value={vdoShoots} note="คิว" />
            <Stat label="🎬 VDO · งานตัด" value={editPieces} note="คลิป" />
            <Stat label="📷 Photo · งานถ่าย" value={photoShoots} note="คิว" />
            <Stat label="รวมอนุมัติ" value={totalPieces} note={`จาก ${totalRequests} ใบงาน`} />
            <Stat label="ใน pipeline" value={openTotal} note="ยังไม่จบ (ทุกเดือน)" />
            <Stat label="Revision rate" value={`${Math.round(revRate * 100)}%`} note="ชิ้นที่ถูกตีกลับ ≥1 ครั้ง" />
          </div>
        </ModuleSummaryCard>

        {/* Current workload — the managing view: who is carrying what right now */}
        <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[14px] font-bold">ภาระงานตอนนี้ · รายคน</div>
            <div className="text-[11.5px] text-faint mt-[2px]">
              งานที่ยังไม่อนุมัติทั้งหมด — “รอ review” คืองานที่ค้างอยู่ฝั่งคนตรวจ ไม่ใช่คนทำ
            </div>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-[12.5px] text-faint">กำลังโหลด…</div>
          ) : workload.length === 0 ? (
            <div className="px-5 py-8 text-center text-[12.5px] text-faint">ไม่มีงานค้างอยู่เลย 🎉</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint border-b border-line">
                    <th className="px-5 py-3">คนทำ</th>
                    <th className="px-3 py-3 text-right">กำลังทำ</th>
                    <th className="px-3 py-3 text-right">รอ review</th>
                    <th className="px-3 py-3 text-right">แก้ revision</th>
                    <th className="px-3 py-3 text-right">เลท</th>
                    <th className="px-5 py-3 text-right">due ใน {DUE_SOON_DAYS} วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((w) => (
                    <tr key={w.designer} className="border-b border-line4 last:border-0">
                      <td className="px-5 py-3">
                        <div className="font-bold">{w.designer}</div>
                        <div className="text-[11px] text-faint">{mixLabel(w)}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{w.inProgress || "—"}</td>
                      <td className="px-3 py-3 text-right text-muted">{w.waitingReview || "—"}</td>
                      <td className="px-3 py-3 text-right" style={w.revision ? { color: "#B8860B", fontWeight: 700 } : undefined}>{w.revision || "—"}</td>
                      <td className="px-3 py-3 text-right" style={w.overdue ? { color: "#B33A2E", fontWeight: 700 } : undefined}>{w.overdue || "—"}</td>
                      <td className="px-5 py-3 text-right" style={w.dueSoon ? { color: "#B8860B", fontWeight: 700 } : undefined}>{w.dueSoon || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Totals — the invoice lines */}
        <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[14px] font-bold">ยอดรายคน · {month ? monthLabel(month) : "—"}</div>
            <div className="text-[11.5px] text-faint mt-[2px]">
              แยกตามประเภทงานเพราะเรตต่างกัน · แก้ revision ไม่นับเป็นชิ้นใหม่
            </div>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-[12.5px] text-faint">กำลังโหลด…</div>
          ) : totals.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-[13px] font-bold text-muted">ยังไม่มีชิ้นงานที่อนุมัติในเดือนนี้</div>
              <div className="text-[11.5px] text-faint mt-1 max-w-[520px] mx-auto">
                นับเฉพาะงานที่ requester กด Approve แล้ว — ถ้าเพิ่งส่งงานหรือยังรอรีวิวจะยังไม่ขึ้นที่นี่
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint border-b border-line">
                    <th className="px-5 py-3">คนทำ</th>
                    <th className="px-5 py-3">ประเภทงาน</th>
                    <th className="px-5 py-3 text-right">ชิ้นงาน</th>
                    <th className="px-5 py-3 text-right">ใบงาน</th>
                    <th className="px-5 py-3 text-right">revision</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {totals.map((t) => {
                    const key = `${t.designer}::${t.kind}`;
                    const rows = inMonth.filter((p) => p.designer === t.designer && p.kind === t.kind);
                    return (
                      <>
                        <tr key={key} className="border-b border-line2">
                          <td className="px-5 py-3 font-bold">{t.designer}</td>
                          <td className="px-5 py-3 text-muted">{WORK_KIND_LABEL[t.kind as WorkKind]}</td>
                          <td className="px-5 py-3 text-right font-extrabold text-[15px]">{t.pieces}</td>
                          <td className="px-5 py-3 text-right text-muted">{t.requests}</td>
                          <td className="px-5 py-3 text-right text-muted">{t.revisions || "—"}</td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={() => setOpen(open === key ? null : key)} className="text-[12px] font-bold text-accent">
                              {open === key ? "ซ่อนรายชิ้น ↑" : "ดูรายชิ้น ↓"}
                            </button>
                          </td>
                        </tr>
                        {open === key && (
                          <tr key={`${key}-detail`}>
                            <td colSpan={6} className="px-5 py-4 bg-ivory border-b border-line2">
                              <PieceList pieces={rows} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Approved work we can't date — real work, so never silently dropped. */}
        {undated.length > 0 && (
          <div className="rounded-cardLg p-5" style={{ background: "#FBF8EE", border: "1px solid #E8CCA0" }}>
            <div className="text-[13px] font-bold" style={{ color: "#C68A1E" }}>
              ⚠ {undated.length} ชิ้นอนุมัติแล้วแต่ไม่มีวันที่ — ไม่ได้นับรวมในเดือนไหน
            </div>
            <div className="text-[11.5px] text-muted mt-1 mb-3">
              งานเหล่านี้ถูกอนุมัติโดยไม่มีการบันทึกเวลา (ข้อมูลเก่าก่อนมีประวัติ) เป็นงานจริงที่ทำไปแล้ว
              แต่ระบบไม่เดาเดือนให้ เพราะจะทำให้ยอดไปโผล่ผิดใบวางบิล — ตรวจแล้วบวกมือเอง
            </div>
            <PieceList pieces={undated} />
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="min-w-[170px] flex-1 rounded-[20px] px-4 py-3" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(92,107,60,0.14)" }}>
      <div className="text-[22px] font-extrabold leading-none text-ink">{value}</div>
      <div className="mt-2 text-[12px] font-bold leading-tight text-muted">{label}</div>
      <div className="mt-[2px] text-[10.5px] leading-tight text-faint">{note}</div>
    </div>
  );
}

/** The pieces behind a number — so a total can be checked, not just trusted. */
function PieceList({ pieces }: { pieces: ArtworkPiece[] }) {
  return (
    <div className="flex flex-col gap-2">
      {pieces.map((p, i) => (
        <div key={`${p.requestId}-${p.size}-${i}`} className="flex flex-wrap items-center gap-2 bg-surface border border-line rounded-card px-3 py-2">
          <BrandDot brand={p.b} />
          <span className="text-[12.5px] font-bold">{p.title}</span>
          <span className="text-[11.5px] text-faint">· {p.size}</span>
          <span className="text-[11px] text-faint">({p.platforms.join(" + ")})</span>
          <span className="text-[11px] text-faint">· {brandName(p.b)} · {p.campaign}</span>
          {p.revisions > 0 && <StatusBadge tone="gold">{p.revisions} revision</StatusBadge>}
          <span className="ml-auto text-[11.5px] text-muted">
            {p.approvedAt ? `approved ${dayLabel(p.approvedAt)}` : "ไม่มีวันที่อนุมัติ"}
          </span>
        </div>
      ))}
    </div>
  );
}
