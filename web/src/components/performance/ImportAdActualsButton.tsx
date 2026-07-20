"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { importAdActualsFromSheet } from "@/lib/db/campaignResult";

const LS_KEY = "mos.adActualsSheetUrl";

/** Pulls ad actuals from the shared "Ad_Actuals" Google Sheet tab into Supabase.
 *  The sheet URL is remembered in localStorage so the team pastes it once. */
export function ImportAdActualsButton({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(LS_KEY) ?? "" : "",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const run = async () => {
    const clean = url.trim();
    if (!clean) { setMsg({ tone: "err", text: "วางลิงก์ Google Sheet ก่อน" }); return; }
    setBusy(true); setMsg(null);
    try {
      localStorage.setItem(LS_KEY, clean);
      const { imported, removed } = await importAdActualsFromSheet(clean);
      setMsg({
        tone: "ok",
        text: removed > 0 ? `นำเข้า ${imported} แถว · แทนที่ของเก่า ${removed}` : `นำเข้าแล้ว ${imported} แถว`,
      });
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
        className="inline-flex items-center gap-2 rounded-full bg-[#E3F7F5] px-3 py-2 text-[12px] font-extrabold text-[#0B7F7A]"
      >
        <Download size={14} /> Import ads จาก Sheet
      </button>
      {open && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="วางลิงก์ Google Sheet (แท็บ Ad_Actuals)"
            className="w-[260px] rounded-[9px] border border-line bg-white px-3 py-2 text-[12px] outline-none focus:border-[#0B7F7A]"
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
        <span className={`text-[11.5px] font-bold ${msg.tone === "ok" ? "text-[#0B7F7A]" : "text-status-gold"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
