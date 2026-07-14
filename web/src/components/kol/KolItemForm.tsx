"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";
import {
  BriefKolItem, KOL_TYPES, KOL_PLATFORMS, KOL_CONTENT, engagementRate, fmtPct,
} from "@/lib/data/brief";

// One shared editor for a KOL Plan item — used by both the Campaign Builder's
// KOL Plan step and the KOL module's "Request KOL" modal, so the "template" is
// identical in both places and a request syncs back into the campaign brief.

const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
const label = "block text-[11.5px] font-bold text-faint mb-[6px]";

export function KolItemForm({ item, onChange, branches = [], outOfRange, hidePage = false, monthKeys = [] }: {
  item: BriefKolItem;
  onChange: (patch: Partial<BriefKolItem>) => void;
  branches?: string[];
  outOfRange?: (iso: string) => boolean;
  /** Hide the KOL name / handle row — used at Request stage where the real page
   *  isn't known yet (the specialist proposes it later). */
  hidePage?: boolean;
  /** Campaign months for splitting creator/page count and KOL budget. */
  monthKeys?: string[];
}) {
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;
  const fmt = (n: number) => n ? n.toLocaleString("en-US") : "";
  const rate = engagementRate(item);
  const togglePlatform = (p: string) => {
    const on = item.platforms.includes(p);
    onChange({ platforms: on ? item.platforms.filter((x) => x !== p) : [...item.platforms, p] });
  };
  const toggleContent = (c: string) => {
    const on = item.contentRequired.includes(c);
    onChange({ contentRequired: on ? item.contentRequired.filter((x) => x !== c) : [...item.contentRequired, c] });
  };
  const monthlyRows = monthKeys.map((month) => item.monthly?.find((row) => row.month === month) ?? { month, budget: 0, pages: 0 });
  const setMonthly = (month: string, patch: Partial<{ budget: number; pages: number; postStart: string; postEnd: string }>) => {
    const next = monthKeys.map((key) => {
      const current = item.monthly?.find((row) => row.month === key) ?? { month: key, budget: 0, pages: 0 };
      return key === month ? { ...current, ...patch } : current;
    });
    const budget = next.reduce((sum, row) => sum + (row.budget || 0), 0);
    const count = next.reduce((sum, row) => sum + (row.pages || 0), 0);
    // Overall posting window = earliest → latest of the per-month post dates.
    const dates = next.flatMap((row) => [row.postStart, row.postEnd]).filter(Boolean) as string[];
    const window = dates.length
      ? { postingStart: dates.reduce((a, b) => (a < b ? a : b)), postingEnd: dates.reduce((a, b) => (a > b ? a : b)) }
      : {};
    onChange({ monthly: next, budget: budget || item.budget, count: count || item.count, ...window });
  };
  const hasMonthlyDates = monthlyRows.some((row) => row.postStart || row.postEnd);

  return (
    <div className="grid md:grid-cols-3 gap-3">
      {!hidePage && <div><label className={label}>KOL / Page Name</label><input value={item.name} onChange={(e) => onChange({ name: e.target.value })} className={field} placeholder="e.g. Tokyo Tom" /></div>}
      {!hidePage && <div className="md:col-span-2"><label className={label}>Page / Handle <span className="text-faint font-normal">· @handle หรือ URL จริง</span></label><input value={item.handle} onChange={(e) => onChange({ handle: e.target.value })} className={field} placeholder="@handle or page URL" /></div>}

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
      <div><label className={label}># Creator / Page</label><input value={fmt(item.count)} onChange={(e) => onChange({ count: num(e.target.value) })} className={field} placeholder="1" /></div>
      <div><label className={label}>Follower / page</label><input value={fmt(item.followers)} onChange={(e) => onChange({ followers: num(e.target.value) })} className={field} placeholder="100,000" /></div>
      <div><label className={label}>Reach / page</label><input value={fmt(item.expectedReach)} onChange={(e) => onChange({ expectedReach: num(e.target.value) })} className={field} placeholder="50,000" /></div>
      <div>
        <label className={label}>Total Reach <span className="text-faint font-normal">· Page × Reach/page</span></label>
        <div className={`${field} bg-surface text-ink font-bold flex items-center`}>{fmt(Math.max(1, item.count || 1) * (item.expectedReach || 0)) || "—"}</div>
      </div>
      <div><label className={label}>Budget</label><input value={fmt(item.budget)} onChange={(e) => onChange({ budget: num(e.target.value), monthly: [] })} className={field} placeholder="฿" /></div>
      <div>
        <label className={label}>Branch / Area <span className="text-faint font-normal">· เลือกได้หลายสาขา</span></label>
        <MultiSelectDropdown
          options={branches}
          selected={item.area ? item.area.split(",").map((s) => s.trim()).filter(Boolean) : []}
          onChange={(next) => onChange({ area: next.join(", ") })}
        />
      </div>
      {monthKeys.length > 0 && (
        <div className="md:col-span-3 rounded-[12px] border border-line2 bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11.5px] font-extrabold text-muted">Monthly split</div>
              <div className="text-[10.5px] text-faint">แบ่ง Budget และ Creator/Page รายเดือน แล้วรวมกลับเข้า field ด้านบนอัตโนมัติ</div>
            </div>
            <div className="text-[11px] font-bold text-ink">
              {fmt(monthlyRows.reduce((sum, row) => sum + row.pages, 0)) || "0"} page · ฿{monthlyRows.reduce((sum, row) => sum + row.budget, 0).toLocaleString("en-US")}
            </div>
          </div>
          {/* One row per month (Excel-style): Month | Pages | Budget | Posting window */}
          <div className="rounded-[10px] border border-line3 overflow-hidden">
            <div className="grid bg-ivory px-3 py-[6px] text-[10px] font-extrabold uppercase tracking-[0.05em] text-faint" style={{ gridTemplateColumns: "0.8fr 0.7fr 1fr 1.6fr" }}>
              <span>Month</span><span>Pages</span><span>Budget (฿)</span><span>วัน Post (เริ่ม → จบ)</span>
            </div>
            {monthlyRows.map((row) => {
              // Clamp the pickers to that month so a typo can't land elsewhere.
              const [y, m] = row.month.split("-").map(Number);
              const monthFirst = `${row.month}-01`;
              const monthLast = `${row.month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
              const dateCls = "w-full rounded-[7px] border border-line2 bg-ivory px-1.5 py-1 text-[11.5px] outline-none";
              return (
                <div key={row.month} className="grid items-center gap-2 border-t border-line4 bg-white px-3 py-[5px]" style={{ gridTemplateColumns: "0.8fr 0.7fr 1fr 1.6fr" }}>
                  <span className="text-[11.5px] font-extrabold text-muted">{row.month}</span>
                  <input value={fmt(row.pages)} onChange={(e) => setMonthly(row.month, { pages: num(e.target.value) })} className="w-full rounded-[7px] border border-line2 bg-ivory px-2 py-1 text-[12px] outline-none" placeholder="0" />
                  <input value={fmt(row.budget)} onChange={(e) => setMonthly(row.month, { budget: num(e.target.value) })} className="w-full rounded-[7px] border border-line2 bg-ivory px-2 py-1 text-[12px] outline-none" placeholder="0" />
                  <span className="flex items-center gap-1">
                    <input type="date" value={row.postStart || ""} min={monthFirst} max={row.postEnd || monthLast}
                      onChange={(e) => setMonthly(row.month, { postStart: e.target.value })} className={dateCls} />
                    <span className="text-faint text-[11px]">→</span>
                    <input type="date" value={row.postEnd || ""} min={row.postStart || monthFirst} max={monthLast}
                      onChange={(e) => setMonthly(row.month, { postEnd: e.target.value })} className={dateCls} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Posting window — after the monthly split so per-month post dates set
          the overall range (auto = earliest → latest of the month rows). */}
      <div>
        <label className={label}>Posting Start{hasMonthlyDates && <span className="text-faint font-normal"> · auto จากวัน Post รายเดือน</span>}</label>
        <DatePicker value={item.postingStart || null} onChange={(v) => onChange({ postingStart: v })} max={item.postingEnd || undefined} invalid={!!outOfRange?.(item.postingStart)} />
      </div>
      <div>
        <label className={label}>Posting End{hasMonthlyDates && <span className="text-faint font-normal"> · auto จากวัน Post รายเดือน</span>}</label>
        <DatePicker value={item.postingEnd || null} onChange={(v) => onChange({ postingEnd: v })} min={item.postingStart || undefined} />
      </div>
      <div><label className={label}>Owner <span className="text-faint font-normal">· KOL team</span></label><OwnerSelect value={item.owner} onChange={(v) => onChange({ owner: v })} team="KOL" /></div>

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

      <div className="md:col-span-3"><label className={label}>Note</label><input value={item.note} onChange={(e) => onChange({ note: e.target.value })} className={field} /></div>
    </div>
  );
}
