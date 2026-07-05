"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import {
  BriefKolItem, KOL_TYPES, KOL_PLATFORMS, KOL_CONTENT, engagementRate, fmtPct,
} from "@/lib/data/brief";

// One shared editor for a KOL Plan item — used by both the Campaign Builder's
// KOL Plan step and the KOL module's "Request KOL" modal, so the "template" is
// identical in both places and a request syncs back into the campaign brief.

const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
const label = "block text-[11.5px] font-bold text-faint mb-[6px]";

export function KolItemForm({ item, onChange, branches = [], outOfRange }: {
  item: BriefKolItem;
  onChange: (patch: Partial<BriefKolItem>) => void;
  branches?: string[];
  outOfRange?: (iso: string) => boolean;
}) {
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;
  const rate = engagementRate(item);
  const togglePlatform = (p: string) => {
    const on = item.platforms.includes(p);
    onChange({ platforms: on ? item.platforms.filter((x) => x !== p) : [...item.platforms, p] });
  };
  const toggleContent = (c: string) => {
    const on = item.contentRequired.includes(c);
    onChange({ contentRequired: on ? item.contentRequired.filter((x) => x !== c) : [...item.contentRequired, c] });
  };

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div><label className={label}>KOL / Page Name</label><input value={item.name} onChange={(e) => onChange({ name: e.target.value })} className={field} placeholder="e.g. Tokyo Tom" /></div>
      <div className="md:col-span-2"><label className={label}>Page / Handle <span className="text-faint font-normal">· @handle หรือ URL จริง</span></label><input value={item.handle} onChange={(e) => onChange({ handle: e.target.value })} className={field} placeholder="@handle or page URL" /></div>

      <div><label className={label}>KOL Type</label><select value={item.kolType} onChange={(e) => onChange({ kolType: e.target.value })} className={field}>{KOL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="md:col-span-3">
        <label className={label}>Platform <span className="text-faint font-normal">· ติ๊กได้หลาย platform</span></label>
        <div className="flex flex-wrap gap-2">
          {KOL_PLATFORMS.map((p) => {
            const on = item.platforms.includes(p);
            return (
              <label key={p} className="flex items-center gap-2 text-[12px] font-semibold px-[11px] py-[6px] rounded-[9px] border cursor-pointer"
                style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { background: "#fff", borderColor: "#E5DECF", color: "#6b6258" }}>
                <input type="checkbox" checked={on} onChange={() => togglePlatform(p)} /> {p}
              </label>
            );
          })}
        </div>
      </div>
      <div className="md:col-span-3">
        <label className={label}>Content Required</label>
        <div className="flex flex-wrap gap-2">
          {KOL_CONTENT.map((c) => {
            const on = item.contentRequired.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggleContent(c)} className="text-[12px] font-semibold px-[12px] py-[6px] rounded-pill border transition-colors"
                style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { color: "#6b6258", background: "#fff", borderColor: "#E5DECF" }}>{c}</button>
            );
          })}
        </div>
      </div>
      <div><label className={label}># Creator / Page</label><input value={item.count || ""} onChange={(e) => onChange({ count: num(e.target.value) })} className={field} placeholder="1" /></div>
      <div><label className={label}>Follower</label><input value={item.followers || ""} onChange={(e) => onChange({ followers: num(e.target.value) })} className={field} placeholder="100000" /></div>
      <div><label className={label}>Expected Reach</label><input value={item.expectedReach || ""} onChange={(e) => onChange({ expectedReach: num(e.target.value) })} className={field} placeholder="50000" /></div>
      <div><label className={label}>Budget</label><input value={item.budget || ""} onChange={(e) => onChange({ budget: num(e.target.value) })} className={field} placeholder="฿" /></div>
      <div><label className={label}>Branch / Area</label><select value={item.area} onChange={(e) => onChange({ area: e.target.value })} className={field}><option value="">—</option>{branches.map((br) => <option key={br}>{br}</option>)}</select></div>

      {/* Engagement metric breakdown */}
      <div className="md:col-span-3 mt-1 pt-3 border-t border-line3">
        <div className="text-[11.5px] font-bold text-muted mb-2">Engagement metric</div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {(["likes", "comments", "shares", "saves", "clicks", "views"] as const).map((m) => (
            <div key={m}>
              <label className="block text-[10.5px] font-bold text-faint mb-[4px] capitalize">{m}</label>
              <input value={item[m] || ""} onChange={(e) => onChange({ [m]: num(e.target.value) } as Partial<BriefKolItem>)} className="w-full text-[13px] px-[10px] py-[8px] rounded-[9px] border border-line2 bg-surface outline-none" placeholder="0" />
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] font-semibold" style={{ color: rate > 0 ? "#4E7A4E" : "#9A9387" }}>
          Engagement rate: <b>{fmtPct(rate)}</b> <span className="text-faint font-normal">= (Like+Comment+Share+Save+Click) ÷ {item.expectedReach > 0 ? "Reach" : "Follower"}</span>
        </div>
      </div>

      <div><label className={label}>Posting Start</label><DatePicker value={item.postingStart || null} onChange={(v) => onChange({ postingStart: v })} max={item.postingEnd || undefined} invalid={!!outOfRange?.(item.postingStart)} /></div>
      <div><label className={label}>Posting End</label><DatePicker value={item.postingEnd || null} onChange={(v) => onChange({ postingEnd: v })} min={item.postingStart || undefined} /></div>
      <div><label className={label}>Owner <span className="text-faint font-normal">· KOL team</span></label><OwnerSelect value={item.owner} onChange={(v) => onChange({ owner: v })} team="KOL" /></div>
      <div className="md:col-span-3"><label className={label}>Note</label><input value={item.note} onChange={(e) => onChange({ note: e.target.value })} className={field} /></div>
    </div>
  );
}
