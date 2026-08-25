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
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { brandName, BrandFilterValue } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { DateFilterBar, DateFilter, inDateFilter } from "@/components/ui/DateFilterBar";
import { ALL_TIME_FILTER, FilterSummary, filterWithReasons } from "@/components/ui/FilterSummary";
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
  // The signed-in role, NOT useRole() — that is the sidebar's "Viewing as"
  // switcher, which anyone may set to CMO. This queue is the CMO's alone (CMO,
  // 26 Aug 2026): everything in it is already live, and a half-audience that
  // can read but not answer only ever produced "why is this still here?".
  const { role, member, user } = useAuth();
  const mayDecide = canApproveCampaign(role);
  // Before the member row lands, role is not yet known — wait rather than
  // flashing "ไม่มีสิทธิ์" at the person who does have it.
  const roleKnown = !AUTH_REQUIRED || !user || !!member;
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

  // Nothing is fetched for someone who may not see it: the gate is not a
  // banner over a loaded list, it is the reason the list is never asked for.
  useEffect(() => { if (mayDecide) void load(); else setLoading(false); }, [load, mayDecide]);

  // Brand scope first, and not as a filter: a campaign belonging to a brand you
  // do not manage is not something "ล้างตัวกรอง" may bring back. Only what
  // survives this is offered to the chips below.
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const mine = useMemo(() => rows.filter((r) => brandVisibility.isVisible(r.b)), [rows, brandVisibility]);

  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [campaign, setCampaign] = useState("all");
  // All time: this queue is for edits that have been running unreviewed, and a
  // month view would hide exactly the oldest of them.
  const [date, setDate] = useState<DateFilter>({ ...ALL_TIME_FILTER });
  useEffect(() => {
    const next = brandVisibility.normalize(brand);
    if (next !== brand) setBrand(next);
  }, [brand, brandVisibility]);

  const campaignOptions = useMemo(() => {
    const names = mine
      .filter((r) => brand === "all" || r.b === brand)
      .map((r) => r.campaignName)
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "th"));
  }, [mine, brand]);
  useEffect(() => {
    if (campaign !== "all" && !campaignOptions.includes(campaign)) setCampaign("all");
  }, [campaign, campaignOptions]);

  const outcome = useMemo(() => filterWithReasons(mine, [
    { label: "แบรนด์อื่น", pass: (r) => brand === "all" || r.b === brand },
    { label: "แคมเปญอื่น", pass: (r) => campaign === "all" || r.campaignName === campaign },
    // A campaign stays if ANY of its edits fall in the window — the card lists
    // the edits, and hiding the card would hide the ones that do match.
    { label: "นอกช่วงเวลา", pass: (r) => r.entries.some((e) => inDateFilter(date, e.at)) },
  ]), [mine, brand, campaign, date]);
  const visible = outcome.rows;
  const clearFilters = () => { setBrand("all"); setCampaign("all"); setDate({ ...ALL_TIME_FILTER }); };

  const total = useMemo(() => visible.reduce((n, r) => n + r.entries.length, 0), [visible]);
  // The oldest outstanding edit, in days — the honest health number for a queue
  // whose whole promise is "cleared weekly".
  const oldest = useMemo(
    () => visible.reduce((max, r) => Math.max(max, ...r.entries.map((e) => daysOld(e.at, now))), 0),
    [visible, now],
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
    if (!window.confirm(`อนุมัติย้อนหลังทั้งหมด ${total} รายการ จาก ${visible.length} แคมเปญ?`)) return;
    // What is on screen, not what was fetched: a filtered list with a button
    // that acts on the unfiltered set is a trap.
    for (const row of visible) {
      await decide(row, row.entries.map((e) => e.id), "acknowledged").catch(() => {});
    }
  };

  if (!roleKnown) {
    return <div className="mt-8 py-12 text-center text-faint text-[13px]">กำลังตรวจสิทธิ์…</div>;
  }

  // Not a banner over a loaded list — the page itself. The rail already hides
  // this entry from everyone else (nav cmoOnly); this is the same rule where a
  // direct link lands.
  if (!mayDecide) {
    return (
      <>
        <CampaignPageHeaderSection
          eyebrow="APPROVALS"
          title="รออนุมัติย้อนหลัง"
          description="คิวนี้เป็นของ CMO"
        />
        <div className="mt-5 rounded-cardLg border px-5 py-8 text-center" style={{ background: "#FBF6EC", borderColor: "#EADBC1" }}>
          <div className="text-[14px] font-bold" style={{ color: "#8A6D1E" }}>เฉพาะ CMO เท่านั้น</div>
          <div className="text-[12.5px] text-faint mt-1">
            การอนุมัติย้อนหลังเป็นสิทธิ์ของ CMO · งานที่แก้ไปแล้วยังเดินต่อตามปกติ ไม่ได้ถูกบล็อก
          </div>
        </div>
      </>
    );
  }

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
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={brand} onChange={(e) => setBrand(e.target.value as BrandFilterValue)} style={SELECT_STYLE} aria-label="แบรนด์">
                <option value="all">{brandVisibility.allowAll ? "ทุกแบรนด์" : "ทุกแบรนด์ที่ดูแล"}</option>
                {brandOptions.map((id) => (
                  <option key={id} value={id}>{brandVisibility.brandNames[id] ?? id}</option>
                ))}
              </select>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={SELECT_STYLE} aria-label="แคมเปญ">
                <option value="all">ทุกแคมเปญ</option>
                {campaignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <DateFilterBar value={date} onChange={setDate} />
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[12px] font-bold text-muted">
            <span>ค้างอยู่ {total} รายการ · {visible.length} แคมเปญ</span>
            {oldest > 0 && (
              <StatusBadge tone={oldest >= 7 ? "red" : oldest >= 4 ? "gold" : "neutral"}>
                เก่าสุด {oldest} วัน
              </StatusBadge>
            )}
            {!brandVisibility.allowAll && (
              <span className="font-normal text-faint">เห็นเฉพาะแบรนด์ที่ดูแล ({brandVisibility.scopeLabel})</span>
            )}
            </div>
          </div>
        </CampaignCommandBar>
        <div className="mt-3">
          <FilterSummary outcome={outcome} onClear={clearFilters} noun="แคมเปญ" />
        </div>
      </div>

      {loading ? (
        <div className="mt-5 py-12 text-center text-faint text-[13px]">กำลังโหลด…</div>
      ) : visible.length === 0 ? (
        <div className="mt-5 py-14 text-center border border-dashed border-line2 rounded-cardLg">
          {/* An empty screen has two very different meanings and must not use
              one sentence for both: nothing is waiting, or the chips hid it. */}
          <div className="text-[15px] font-bold text-muted">
            {mine.length ? "ไม่มีรายการที่ตรงกับตัวกรอง" : "ไม่มีอะไรค้าง"}
          </div>
          <div className="text-[12.5px] text-faint mt-1">
            {mine.length
              ? "ลองล้างตัวกรองแบรนด์ / แคมเปญ / ช่วงเวลาด้านบน"
              : "การแก้แคมเปญที่อนุมัติแล้วในส่วนของงบ / ช่วงเวลา / ขอบเขต / KOL จะมารออยู่ที่นี่"}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {visible.map((row) => (
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
