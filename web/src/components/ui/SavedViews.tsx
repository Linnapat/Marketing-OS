"use client";

// Per-user saved views for module headers: snapshot the page's current
// filter/view state under a name, recall it from a dropdown. Stored in
// localStorage keyed by page + signed-in member, so each person keeps their
// own set (same pattern Content Plan pioneered).

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

interface SavedView<T> { name: string; state: T }

export function SavedViewsBar<T>({ pageKey, current, onApply }: {
  pageKey: string;
  /** The page state a saved view should capture (filters, view mode, period…). */
  current: T;
  onApply: (state: T) => void;
}) {
  const { member, user } = useAuth();
  const userKey = member?.name || user?.email || "guest";
  const storageKey = `mos-saved-views:${pageKey}:${userKey}`;
  const [views, setViews] = useState<SavedView<T>[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as SavedView<T>[];
      setViews(Array.isArray(parsed) ? parsed : []);
    } catch { setViews([]); }
  }, [storageKey]);

  const persist = (next: SavedView<T>[]) => {
    setViews(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    persist([{ name: n, state: current }, ...views.filter((v) => v.name !== n)].slice(0, 12));
    setName("");
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("apply:")) {
            const picked = views.find((x) => x.name === v.slice(6));
            if (picked) onApply(picked.state);
          } else if (v.startsWith("delete:")) {
            persist(views.filter((x) => x.name !== v.slice(7)));
          }
        }}
        className="text-[12px] font-bold rounded-pill border border-line2 bg-white px-3 py-[8px] text-muted outline-none cursor-pointer"
        title="Saved views (ของฉัน)"
      >
        <option value="">Saved views</option>
        {views.map((v) => <option key={v.name} value={`apply:${v.name}`}>{v.name}</option>)}
        {views.length > 0 && <option disabled>──────</option>}
        {views.map((v) => <option key={`d-${v.name}`} value={`delete:${v.name}`}>🗑 ลบ: {v.name}</option>)}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder="name this view"
        className="w-[130px] text-[12px] rounded-pill border border-line2 bg-white px-3 py-[8px] outline-none"
      />
      <button onClick={save} disabled={!name.trim()}
        className="text-[12px] font-bold rounded-pill bg-[#F2EEFF] px-3 py-[8px] text-[#6C5CE7] disabled:opacity-40">
        Save view
      </button>
    </div>
  );
}
