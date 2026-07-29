"use client";

// Trash — everything deleted in the last 7 days, with one click to put it back.
//
// Deleting used to be final ("การลบย้อนกลับไม่ได้"), so a mis-click on a
// campaign took its posts, briefs and tasks with it. Deletes are soft now and
// land here; after TRASH_RETENTION_DAYS they are purged for real.
//
// Visibility: RLS already scopes rows to the brands a person can see, and the
// list is filtered again by the Permissions matrix — restoring a Content post
// is a Content-module action, so a role without Content never sees one here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Trash2, RefreshCw } from "lucide-react";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRole } from "@/lib/role";
import { toastError, toastSuccess } from "@/lib/toast";
import {
  TrashEntry, TrashKind, TRASH_RETENTION_DAYS,
  fetchTrash, restoreFromTrash, purgeOne, purgeExpiredTrash, trashReady, trashKindLabel, trashUsesDb,
} from "@/lib/db/trash";

/** Which Permissions-matrix module each kind belongs to. My Task is ungated —
 *  My Tasks itself is open to every internal role (see lib/permissions). */
const KIND_MODULE: Record<TrashKind, string | null> = {
  content: "Content",
  campaign: "Campaign",
  graphic: "Graphic",
  task: null,
};

const KIND_ICON: Record<TrashKind, string> = {
  content: "📅", campaign: "🎯", graphic: "🎨", task: "✅",
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};

export default function TrashPage() {
  const { can } = useRole();
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string>("");
  const [kind, setKind] = useState<TrashKind | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ok = await trashReady();
      setReady(ok);
      if (!ok) { setEntries([]); return; }
      // Enforce the 7-day rule on open, so it holds without pg_cron scheduled.
      await purgeExpiredTrash();
      setEntries(await fetchTrash());
    } catch (error) {
      toastError(`โหลดถังขยะไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A row whose module this role cannot see must not be restorable from here —
  // Trash would otherwise be a side door around the Permissions matrix.
  const visible = useMemo(() => entries.filter((e) => {
    const mod = KIND_MODULE[e.kind];
    return (!mod || can(mod)) && (kind === "all" || e.kind === kind);
  }), [entries, can, kind]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: 0 };
    for (const e of entries) {
      const mod = KIND_MODULE[e.kind];
      if (mod && !can(mod)) continue;
      out.all++; out[e.kind] = (out[e.kind] ?? 0) + 1;
    }
    return out;
  }, [entries, can]);

  const restore = async (e: TrashEntry) => {
    setBusyId(e.id);
    try {
      await restoreFromTrash(e.kind, e.id);
      setEntries((list) => list.filter((x) => !(x.kind === e.kind && x.id === e.id)));
      toastSuccess(`กู้คืน “${e.title}” เรียบร้อย`);
    } catch (error) {
      toastError(`กู้คืนไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusyId(""); }
  };

  const purge = async (e: TrashEntry) => {
    if (!window.confirm(`ลบ “${e.title}” ถาวร?\n\nอันนี้กู้คืนไม่ได้อีก`)) return;
    setBusyId(e.id);
    try {
      await purgeOne(e.kind, e.id);
      setEntries((list) => list.filter((x) => !(x.kind === e.kind && x.id === e.id)));
      toastSuccess(`ลบ “${e.title}” ถาวรแล้ว`);
    } catch (error) {
      toastError(`ลบถาวรไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusyId(""); }
  };

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="TRASH"
        title="ถังขยะ"
        description={`งานที่ลบไว้ กู้คืนได้ภายใน ${TRASH_RETENTION_DAYS} วัน · หลังจากนั้นระบบจะล้างถาวรอัตโนมัติ`}
      />

      <div className="mt-5">
        <CampaignCommandBar
          action={
            <button onClick={() => void load()} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[12px] px-3 py-[8px] bg-white hover:bg-ivory">
              <RefreshCw size={13} /> Refresh
            </button>
          }
        >
          <div className="flex items-center gap-1 bg-ivory border border-line2 rounded-pill p-[3px] flex-wrap">
            {([["all", "ทั้งหมด"], ["content", "Content"], ["campaign", "Campaign"], ["graphic", "Graphic"], ["task", "Task"]] as const).map(([value, label]) => (
              <button key={value} onClick={() => setKind(value)}
                className="text-[12px] font-bold px-[13px] py-[5px] rounded-pill"
                style={kind === value ? { background: "#211F1C", color: "#fff" } : { color: "#6b6258" }}>
                {label}{counts[value] ? ` ${counts[value]}` : ""}
              </button>
            ))}
          </div>
        </CampaignCommandBar>
      </div>

      {ready === false && trashUsesDb() && (
        <div className="mt-4 rounded-cardLg border px-4 py-3 text-[12.5px] font-semibold" style={{ background: "#FBF6EC", borderColor: "#EADBC1", color: "#8A6D1E" }}>
          ⚠ ยังไม่ได้เปิดใช้ถังขยะในฐานข้อมูล — รัน <code className="font-mono">supabase/soft_delete_trash.sql</code> ก่อน
          จนกว่าจะรัน การลบจะยังเป็นการลบถาวรเหมือนเดิม
        </div>
      )}
      {ready === false && !trashUsesDb() && (
        <div className="mt-4 rounded-cardLg border px-4 py-3 text-[12.5px] font-semibold" style={{ background: "#F0EDE6", borderColor: "#E5DECF", color: "#6b6258" }}>
          โหมด mock (ยังไม่ได้ต่อฐานข้อมูล) — ถังขยะจะทำงานจริงเมื่อรันบน Supabase
        </div>
      )}

      {loading ? (
        <div className="mt-5 py-12 text-center text-faint text-[13px]">กำลังโหลด…</div>
      ) : visible.length === 0 ? (
        <div className="mt-5 py-14 text-center border border-dashed border-line2 rounded-cardLg">
          <div className="text-[15px] font-bold text-muted">ถังขยะว่าง</div>
          <div className="text-[12.5px] text-faint mt-1">งานที่ลบจะมาพักที่นี่ {TRASH_RETENTION_DAYS} วันก่อนถูกล้างถาวร</div>
        </div>
      ) : (
        <div className="mt-5 bg-surface border border-line rounded-cardLg overflow-hidden">
          {visible.map((e) => (
            <div key={`${e.kind}:${e.id}`} className="flex items-center gap-3 px-5 py-[13px] border-b border-line4 last:border-0 flex-wrap">
              <span className="text-[15px]" aria-hidden>{KIND_ICON[e.kind]}</span>
              <div className="flex-1 min-w-[180px]">
                <div className="text-[13px] font-bold truncate">{e.title}</div>
                <div className="text-[11px] text-faint">
                  {[trashKindLabel(e.kind), e.campaign, `ลบโดย ${e.deletedBy}`, fmtWhen(e.deletedAt)].filter(Boolean).join(" · ")}
                </div>
              </div>
              {/* 0 วัน = จะถูกล้างรอบถัดไป — เตือนด้วยสีแดงไม่ใช่เขียว */}
              <StatusBadge tone={e.daysLeft <= 1 ? "red" : e.daysLeft <= 3 ? "gold" : "neutral"}>
                {e.daysLeft <= 0 ? "กำลังจะถูกล้าง" : `เหลือ ${e.daysLeft} วัน`}
              </StatusBadge>
              <button onClick={() => void restore(e)} disabled={busyId === e.id}
                className="inline-flex items-center gap-[5px] text-[12px] font-bold rounded-[9px] px-3 py-[7px] text-white bg-panel disabled:opacity-40">
                <RotateCcw size={13} /> กู้คืน
              </button>
              <button onClick={() => void purge(e)} disabled={busyId === e.id}
                className="inline-flex items-center gap-[5px] text-[12px] font-bold rounded-[9px] px-3 py-[7px] border border-line2 bg-surface text-status-red disabled:opacity-40">
                <Trash2 size={13} /> ลบถาวร
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
