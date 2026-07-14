"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT, ToastPayload, ToastTone } from "@/lib/toast";

interface ToastItem extends ToastPayload { id: number }

const TONE_STYLE: Record<ToastTone, { bg: string; fg: string; border: string; icon: string }> = {
  error: { bg: "#FFF5F4", fg: "#B33A2E", border: "#F5C8C4", icon: "⚠️" },
  success: { bg: "#EEF4EE", fg: "#4E7A4E", border: "#CFE4C2", icon: "✓" },
  info: { bg: "#211F1C", fg: "#FFFFFF", border: "#3A3630", icon: "ℹ️" },
};

/** Renders the toast stack (bottom-center). Mounted once in AppShell; pages
 *  fire toasts via toast()/toastError() from @/lib/toast. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      setItems((list) => [...list.slice(-3), { ...detail, id }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 6000);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[400] flex flex-col gap-2 items-center" style={{ bottom: 24 }}>
      {items.map((t) => {
        const s = TONE_STYLE[t.tone];
        return (
          <button
            key={t.id}
            onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
            className="flex items-center gap-2 rounded-[14px] px-5 py-3 shadow-2xl text-left max-w-[560px]"
            style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
          >
            <span className="text-[15px] flex-shrink-0">{s.icon}</span>
            <span className="text-[13px] font-semibold leading-snug">{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
