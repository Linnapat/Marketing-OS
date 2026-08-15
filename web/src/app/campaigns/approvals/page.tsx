"use client";

// Retro-approval queue — edits made to campaigns that were ALREADY approved.
//
// The point of this screen is that it is not urgent. Every change listed here
// is already live: the campaign kept its status when the edit landed, the
// fan-out ran, and the team carried on. What is outstanding is the CMO's
// answer, which they give here in one pass (the weekly reminder in
// /api/notify/digest is what brings them back).
//
// Lives under /campaigns rather than /approvals: that path is a permanent
// redirect to the Status Board (see next.config.mjs — the old Approval Queue
// was folded in there), and it inherits the Campaign permission module from
// its prefix instead of needing its own entry in the route map.
//
// Only edits classified "major" by data/briefDiff reach this list — money,
// scope, timing, KOL, goals. Caption and copy edits are logged on the campaign
// and never queued; queueing those is what made the old rule unusable.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCheck, RefreshCw, Undo2, ExternalLink } from "lucide-react";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRole } from "@/lib/role";
import { brandName } from "@/lib/brands";
import { canApproveCampaign } from "@/lib/roleGates";
import { toastError, toastSuccess } from "@/lib/toast";
import { notify } from "@/lib/notify";
import { workLink } from "@/lib/deepLink";
import {
  RetroApprovalRow, fetchRetroApprovalQueue, resolveRetroApprovals,
} from "@/lib/db/retroApproval";

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};

/** How long an edit has been running unreviewed. The number that says whether
 *  the weekly pass is actually happening. */
const daysOld = (iso: string, now: number): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 86_400_000));
};

export default function ApprovalsPage() {
  const { role } = useRole();
  const mayDecide = canApproveCampaign(role);
  const [rows, setRows] = useState<RetroApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRetroApprovalQueue());
      setNow(Date.now());
    } catch (error) {
      toastError(`โหลดคิวอนุมัติไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => rows.reduce((n, r) => n + r.entries.length, 0), [rows]);
  // The oldest outstanding edit, in days — the honest health number for a queue
  // whose whole promise is "cleared weekly".
  const oldest = useMemo(
    () => rows.reduce((max, r) => Math.max(max, ...r.entries.map((e) => daysOld(e.at, now))), 0),
    [rows, now],
  );

  const decide = async (row: RetroApprovalRow, ids: string[], decision: "acknowledged" | "rejected") => {
    if (decision === "rejected" && !window.confirm(
      `ตีกลับการแก้ไข ${ids.length} รายการของ “${row.campaignName}”?\n\n`
      + "งานที่สร้างไปแล้ว (โพสต์ / ใบงาน) จะไม่ถูกลบ — แคมเปญจะถูกส่งกลับเป็น Need Revision "
      + "ให้คนแก้กลับมาจัดการเอง",
    )) return;
    setBusy(`${row.campaignId}:${ids.join(",")}`);
    try {
      const n = await resolveRetroApprovals(row.campaignId, ids, decision, role || "CMO");
      if (n === 0) {
        toastSuccess("รายการนี้ถูกเคลียร์ไปแล้ว — กำลังโหลดคิวใหม่");
      } else if (decision === "acknowledged") {
        toastSuccess(`อนุมัติย้อนหลัง ${n} รายการของ “${row.campaignName}” แล้ว`);
      } else {
        toastSuccess(`ตีกลับ ${n} รายการ — ส่ง “${row.campaignName}” กลับไปแก้แล้ว`);
        // The planner has to act now, so this one is a DM, not a bell entry.
        notify("rejected", `↩️ การแก้ไขถูกตีกลับ: ${row.campaignName}`,
          `โดย ${role || "CMO"} · แคมเปญกลับไปเป็น Need Revision — แก้ให้ตรงกับที่อนุมัติไว้`,
          workLink.campaign(row.campaignId, "approval"),
          { to: [row.entries.find((e) => ids.includes(e.id))?.by].filter(Boolean) as string[] });
      }
      await load();
    } catch (error) {
      toastError(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusy(""); }
  };

  const clearAll = async () => {
    if (!window.confirm(`อนุมัติย้อนหลังทั้งหมด ${total} รายการ จาก ${rows.length} แคมเปญ?`)) return;
    for (const row of rows) {
      await decide(row, row.entries.map((e) => e.id), "acknowledged").catch(() => {});
    }
  };

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="APPROVALS"
        title="รออนุมัติย้อนหลัง"
        description="การแก้ไขแคมเปญที่อนุมัติไปแล้ว — งานเดินต่อตามปกติ ไม่ถูกบล็อก · เคลียร์รวดเดียวสัปดาห์ละครั้งได้"
      />

      <div className="mt-5">
        <CampaignCommandBar
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => void load()} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[12px] px-3 py-[8px] bg-white hover:bg-ivory">
                <RefreshCw size={13} /> Refresh
              </button>
              {mayDecide && total > 0 && (
                <button onClick={() => void clearAll()} disabled={!!busy}
                  className="inline-flex items-center gap-[6px] text-[12px] font-bold text-white bg-panel rounded-[12px] px-4 py-[8px] disabled:opacity-40">
                  <CheckCheck size={13} /> อนุมัติทั้งหมด ({total})
                </button>
              )}
            </div>
          }
        >
          <div className="flex items-center gap-3 flex-wrap text-[12px] font-bold text-muted">
            <span>ค้างอยู่ {total} รายการ · {rows.length} แคมเปญ</span>
            {oldest > 0 && (
              <StatusBadge tone={oldest >= 7 ? "red" : oldest >= 4 ? "gold" : "neutral"}>
                เก่าสุด {oldest} วัน
              </StatusBadge>
            )}
          </div>
        </CampaignCommandBar>
      </div>

      {!mayDecide && (
        <div className="mt-4 rounded-cardLg border px-4 py-3 text-[12.5px] font-semibold" style={{ background: "#FBF6EC", borderColor: "#EADBC1", color: "#8A6D1E" }}>
          ดูได้อย่างเดียว — การอนุมัติย้อนหลังเป็นสิทธิ์ของ CMO
        </div>
      )}

      {loading ? (
        <div className="mt-5 py-12 text-center text-faint text-[13px]">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="mt-5 py-14 text-center border border-dashed border-line2 rounded-cardLg">
          <div className="text-[15px] font-bold text-muted">ไม่มีอะไรค้าง</div>
          <div className="text-[12.5px] text-faint mt-1">
            การแก้แคมเปญที่อนุมัติแล้วในส่วนของงบ / ช่วงเวลา / ขอบเขต / KOL จะมารออยู่ที่นี่
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.campaignId} className="bg-surface border border-line rounded-cardLg overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-line4 flex-wrap">
                <Link href={`/campaigns/${row.campaignId}`} className="text-[13.5px] font-bold text-ink hover:underline inline-flex items-center gap-[5px]">
                  {row.campaignName} <ExternalLink size={12} className="opacity-50" />
                </Link>
                <span className="text-[11px] text-faint">
                  {[row.code, brandName(row.b), row.status].filter(Boolean).join(" · ")}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <StatusBadge tone="gold">{row.entries.length} รายการ</StatusBadge>
                  {mayDecide && row.entries.length > 1 && (
                    <button onClick={() => void decide(row, row.entries.map((e) => e.id), "acknowledged")} disabled={!!busy}
                      className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-3 py-[6px] disabled:opacity-40">
                      อนุมัติทั้งแคมเปญ
                    </button>
                  )}
                </div>
              </div>

              {row.entries.map((e) => {
                const age = daysOld(e.at, now);
                return (
                  <div key={e.id} className="px-5 py-[13px] border-b border-line4 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-muted">แก้โดย {e.by}</span>
                      <span className="text-[11px] text-faint">{fmtWhen(e.at)}</span>
                      {age >= 4 && <StatusBadge tone={age >= 7 ? "red" : "gold"}>ค้าง {age} วัน</StatusBadge>}
                      {mayDecide && (
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => void decide(row, [e.id], "acknowledged")} disabled={!!busy}
                            className="inline-flex items-center gap-[5px] text-[12px] font-bold rounded-[9px] px-3 py-[7px] text-white bg-panel disabled:opacity-40">
                            <CheckCheck size={13} /> อนุมัติ
                          </button>
                          <button onClick={() => void decide(row, [e.id], "rejected")} disabled={!!busy}
                            className="inline-flex items-center gap-[5px] text-[12px] font-bold rounded-[9px] px-3 py-[7px] border border-line2 bg-surface text-status-red disabled:opacity-40">
                            <Undo2 size={13} /> ตีกลับ
                          </button>
                        </div>
                      )}
                    </div>
                    <ul className="mt-2 flex flex-col gap-[3px]">
                      {e.changes.map((c: string, i: number) => (
                        <li key={i} className="text-[12.5px] text-ink">• {c}</li>
                      ))}
                    </ul>
                    {!!e.minor?.length && (
                      <div className="mt-1.5 text-[11.5px] text-faint">
                        แก้รายละเอียดพร้อมกันด้วย: {e.minor.join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
