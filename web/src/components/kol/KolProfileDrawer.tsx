"use client";

// Quick look at a creator without leaving the Library table — the specialist is
// usually scanning 20 at a time and losing the filters to a page navigation
// costs more than it saves. The full record is one click further, in a new tab.

import { X, ExternalLink } from "lucide-react";
import { KolProfileCard } from "@/components/kol/KolProfileCard";

export function KolProfileDrawer({ kolId, onClose }: { kolId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full max-w-[560px] h-full shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface border-b border-line px-5 py-3 flex items-center gap-3">
          <span className="text-[13px] font-extrabold text-ink">KOL Profile</span>
          <a href={`/kol/${kolId}`} target="_blank" rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-accent hover:underline">
            เปิดเต็มหน้า <ExternalLink size={12} />
          </a>
          <button onClick={onClose} aria-label="Close" className="text-faint hover:text-ink"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          <KolProfileCard kolId={kolId} compact />
        </div>
      </div>
    </div>
  );
}
