"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { importKolActualsFromSheet } from "@/lib/db/kolActualsImport";

const LS_KEY = "mos.kolActualsSheetUrl";

/** Pulls KOL actuals from the shared "KOL_Activities" Google Sheet tab into
 *  Supabase. The sheet URL is remembered so the team pastes it once — scoped
 *  per brand (when one is selected) so a browser used across brands can't
 *  accidentally import the wrong brand's sheet. */
export function ImportKolActualsButton({ onDone, brand }: { onDone?: () => void; brand?: string }) {
  const lsKey = brand && brand !== "all" ? `${LS_KEY}.${brand}` : LS_KEY;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(lsKey) ?? "" : "",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setUrl(localStorage.getItem(lsKey) ?? "");
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  const run = async () => {
    const clean = url.trim();
    if (!clean) { setMsg({ tone: "err", text: "วางลิงก์ Google Sheet ก่อน" }); return; }
    setBusy(true); setMsg(null);
    try {
      localStorage.setItem(lsKey, clean);
      const { imported, removed, skipped } = await importKolActualsFromSheet(clean);
      const parts = [`นำเข้า ${imported} KOL`];
      if (removed > 0) parts.push(`แทนที่ ${removed}`);
      if (skipped > 0) parts.push(`ข้าม ${skipped}`);
      setMsg({ tone: "ok", text: parts.join(" · ") });
      onDone?.();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-[#FFF3E5] px-3 py-2 text-[12px] font-extrabold text-[#B4711F]"
      >
        <Download size={14} /> Import KOL จาก Sheet
      </button>
      {open && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="วางลิงก์ Google Sheet (แท็บ KOL_Activities)"
            className="w-[260px] rounded-[9px] border border-line bg-white px-3 py-2 text-[12px] outline-none focus:border-[#B4711F]"
          />
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#17172A] px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} นำเข้า
          </button>
        </div>
      )}
      {msg && (
        <span className={`text-[11.5px] font-bold ${msg.tone === "ok" ? "text-[#B4711F]" : "text-status-gold"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
