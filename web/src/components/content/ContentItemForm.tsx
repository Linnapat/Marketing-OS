"use client";

import { useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  BriefContentItem, CONTENT_TYPES, CONTENT_PLATFORMS, assetSizesFor, PRIORITIES,
  GRAPHIC_MIN_BUSINESS_DAYS, isGraphicDueDateAllowed, minGraphicDueDate, todayIso,
} from "@/lib/data/brief";
import { artworkUnitsOf } from "@/lib/data/graphic";

// One shared editor for a Content Plan item — used by both the Campaign Builder's
// Content Plan step and the Content Calendar's New Post modal, so the "template"
// is identical in both places.

const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
const label = "block text-[11.5px] font-bold text-faint mb-[6px]";

export function ContentItemForm({ item, onChange, outOfRange, requesterFallback, showAssignmentFields, requestDate, publishTime, onPublishTimeChange }: {
  item: BriefContentItem;
  onChange: (patch: Partial<BriefContentItem>) => void;
  outOfRange?: (iso: string) => boolean;
  requesterFallback?: string;
  showAssignmentFields?: boolean;
  requestDate?: string;
  publishTime?: string;
  onPublishTimeChange?: (value: string) => void;
}) {
  const [customSizes, setCustomSizes] = useState<Record<string, string>>({});
  const requesterValue = item.requester?.trim() || "";
  const requesterDisplay = requesterValue || requesterFallback || "You";
  const approverDisplay = item.approver?.trim() || requesterDisplay;
  const graphicRequestDate = requestDate || todayIso();
  const minGraphicDue = minGraphicDueDate(graphicRequestDate);
  const graphicLeadValid = !item.graphicDueDate || isGraphicDueDateAllowed(item.graphicDueDate, graphicRequestDate);
  const graphicAfterPublish = !!item.graphicDueDate && !!item.publishDate && item.graphicDueDate > item.publishDate;
  const togglePlatform = (p: string) => {
    const on = item.platforms.includes(p);
    onChange({
      platforms: on ? item.platforms.filter((x) => x !== p) : [...item.platforms, p],
      assets: on ? item.assets.filter((a) => a.platform !== p) : item.assets,
    });
  };
  const toggleAsset = (platform: string, size: string) => {
    const has = item.assets.some((a) => a.platform === platform && a.size === size);
    onChange({ assets: has ? item.assets.filter((a) => !(a.platform === platform && a.size === size)) : [...item.assets, { platform, size }] });
  };
  const addCustomSize = (platform: string) => {
    const size = (customSizes[platform] || "").trim();
    if (!size) return;
    const exists = item.assets.some((a) => a.platform === platform && a.size.toLowerCase() === size.toLowerCase());
    if (!exists) onChange({ assets: [...item.assets, { platform, size }] });
    setCustomSizes((map) => ({ ...map, [platform]: "" }));
  };
  const graphicDueField = item.requiredGraphic ? (
    <div>
      <label className={label}>Graphic Due Date <span className="text-status-red">*</span></label>
      <DatePicker
        value={item.graphicDueDate || null}
        onChange={(v) => onChange({ graphicDueDate: v })}
        min={minGraphicDue}
        max={item.publishDate || undefined}
        invalid={!!item.graphicDueDate && (!graphicLeadValid || graphicAfterPublish)}
      />
      <div className="mt-1 text-[11px]" style={{ color: item.graphicDueDate && (!graphicLeadValid || graphicAfterPublish) ? "#B33A2E" : "#9A9387" }}>
        กำหนดส่งงาน Creative · เร็วสุด {minGraphicDue} ({GRAPHIC_MIN_BUSINESS_DAYS} วันทำการหลัง Request date) · ต้องไม่เกิน Publish Date
      </div>
    </div>
  ) : null;

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {showAssignmentFields !== false && (
        <div className="md:col-span-2 grid md:grid-cols-3 gap-3">
          <div>
            <label className={label}>Requester</label>
            <input value={requesterDisplay} readOnly aria-readonly="true" className={`${field} text-ink bg-ivory cursor-not-allowed`} />
          </div>
          <div>
            <label className={label}>Designer</label>
            <input value={item.designer || "Creative leader will assign after brief"} readOnly aria-readonly="true" className={`${field} text-faint bg-ivory cursor-not-allowed`} />
          </div>
          <div>
            <label className={label}>Approver <span className="text-faint font-normal">· = requester</span></label>
            {/* The approver of a content brief is its requester, always: they
                asked for the work, they accept it. Showing a picker (defaulting
                to the CMO) invited briefs to be routed to someone who never
                asked for them — so the field is read-only on both surfaces. */}
            <input value={`= Requester (${approverDisplay})`} readOnly aria-readonly="true" className={`${field} text-ink bg-ivory cursor-not-allowed`} />
          </div>
        </div>
      )}
      <div><label className={label}>Content Title <span className="text-status-red">*</span></label><input value={item.title} onChange={(e) => onChange({ title: e.target.value })} className={field} placeholder="เช่น Wagyu plating reel" /></div>
      <div><label className={label}>Sub Head <span className="text-status-red">*</span></label><input value={item.subHead} onChange={(e) => onChange({ subHead: e.target.value })} className={field} placeholder="หัวข้อรอง" /></div>
      <div><label className={label}>Content Type</label><select value={item.type} onChange={(e) => onChange({ type: e.target.value })} className={field}>{CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
      {requestDate ? (
        <div className={`md:col-span-2 grid gap-3 ${onPublishTimeChange ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {graphicDueField}
          <div>
            <label className={label}>Publish Date</label>
            <DatePicker value={item.publishDate || null} onChange={(v) => onChange({ publishDate: v })} invalid={!!outOfRange?.(item.publishDate)} />
          </div>
          {onPublishTimeChange && (
            <div>
              <label className={label}>Publish time</label>
              <input type="time" value={publishTime || "10:00"} onChange={(e) => onPublishTimeChange(e.target.value)} className={field} />
            </div>
          )}
        </div>
      ) : (
        <>
          {graphicDueField}
          <div><label className={label}>Publish Date</label><DatePicker value={item.publishDate || null} onChange={(v) => onChange({ publishDate: v })} invalid={!!outOfRange?.(item.publishDate)} /></div>
        </>
      )}
      <div><label className={label}>Priority</label><select value={item.priority} onChange={(e) => onChange({ priority: e.target.value })} className={field}>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="flex flex-col gap-1">
        <div className="flex items-end gap-4">
          {/* Graphic and Video are mutually exclusive — a content item with both
              is really two deliverables with two publish dates, not one. Asking
              for both means adding a second Content item instead. */}
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted"><input type="checkbox" checked={item.requiredGraphic} onChange={(e) => onChange({ requiredGraphic: e.target.checked, requiredVideo: e.target.checked ? false : item.requiredVideo })} /> Required Graphic</label>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted"><input type="checkbox" checked={item.requiredVideo} onChange={(e) => onChange({ requiredVideo: e.target.checked, requiredGraphic: e.target.checked ? false : item.requiredGraphic })} /> Required Video</label>
        </div>
        <div className="text-[11px] text-faint">
          {item.requiredGraphic
            ? "ติ๊กไว้ = ส่งเข้า Graphic Request อัตโนมัติ · โพสต์จะ publish ได้เมื่องานกราฟฟิกอนุมัติครบ"
            : item.requiredVideo
              ? "ติ๊กไว้ = ส่งเข้า Graphic Request อัตโนมัติ (วิดีโอ) · โพสต์จะ publish ได้เมื่องานอนุมัติครบ"
              : "ไม่ติ๊ก = ไม่ต้องใช้กราฟฟิก · publish ได้โดยไม่ต้องรอ asset"}
        </div>
        <div className="text-[11px] text-faint">อยากได้ทั้ง Graphic และ Video สำหรับโพสต์เดียวกัน? สร้างเป็น Content ใหม่แยกกัน เพราะวันโพสต์มักไม่เหมือนกัน</div>
      </div>

      {/* Platform + Asset Size — multi-select checkboxes */}
      <div className="md:col-span-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className={label}>Platforms <span className="text-status-red">*</span> <span className="text-faint font-normal">· Asset size optional</span></label>
          {/* Live piece count, from the same artworkUnitsOf the billing report
              counts with — so what you commit to here is what gets invoiced. */}
          {item.platforms.length > 0 && item.requiredGraphic && <ArtworkCounter assets={item.assets} />}
        </div>
        <div className="mb-2 text-[11px] text-faint">Content Type กำหนดรูปแบบงาน ส่วน Platform จะรวมเป็น Graphic Request เดียว ไม่สร้างงานซ้ำ · ใส่ size เฉพาะตอนมี requirement พิเศษ</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {CONTENT_PLATFORMS.map((p) => {
            const on = item.platforms.includes(p);
            return (
              <label key={p} className="flex items-center gap-2 text-[12px] font-semibold px-[11px] py-[6px] rounded-[9px] border cursor-pointer"
                style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { background: "#fff", borderColor: "#E5DECF", color: "#6b6258" }}>
                <input type="checkbox" checked={on} onChange={() => togglePlatform(p)} /> {p}
              </label>
            );
          })}
        </div>
        {item.platforms.map((p) => (
          <div key={p} className="mb-2 pl-2 border-l-2" style={{ borderColor: "#E5DECF" }}>
            <div className="text-[11.5px] font-bold text-muted mb-1">{p} · optional size</div>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Preset sizes + any custom sizes already saved for this platform,
                  so a typed-in artwork size shows as a checkbox you can save/untick. */}
              {Array.from(new Set([
                ...assetSizesFor(p),
                ...item.assets.filter((a) => a.platform === p).map((a) => a.size),
              ])).map((s) => {
                const on = item.assets.some((a) => a.platform === p && a.size === s);
                const isCustom = !assetSizesFor(p).includes(s);
                return (
                  <label key={s} className="flex items-center gap-[6px] text-[11.5px] font-semibold px-[10px] py-[5px] rounded-pill border cursor-pointer"
                    style={on ? { background: "#EEF4EE", borderColor: "#4E7A4E", color: "#4E7A4E" } : { background: "#fff", borderColor: "#E5DECF", color: "#6b6258" }}>
                    <input type="checkbox" checked={on} onChange={() => toggleAsset(p, s)} /> {s}{isCustom && <span className="text-[9px] opacity-70">custom</span>}
                  </label>
                );
              })}
              <input
                value={customSizes[p] || ""}
                onChange={(e) => setCustomSizes((map) => ({ ...map, [p]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(p); } }}
                placeholder="custom size"
                className="w-[120px] text-[11.5px] px-[10px] py-[5px] rounded-pill border border-line2 bg-white outline-none"
              />
              <button
                type="button"
                onClick={() => addCustomSize(p)}
                className="text-[11.5px] font-bold px-[10px] py-[5px] rounded-pill border border-[#DDD1FF] text-[#6C5CE7] bg-[#F7F2FF]"
              >
                + size
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Content brief block */}
      <div className="md:col-span-2 mt-1 pt-3 border-t border-line3 grid md:grid-cols-2 gap-3">
        <div><label className={label}>Main Message (item)</label><input value={item.mainMessage} onChange={(e) => onChange({ mainMessage: e.target.value })} className={field} /></div>
        {/* A textarea, not an input: caption briefs run to whole sentences, and a
            one-line box hides everything past the first clause. rows grows with
            the text so a long brief is readable in place, without a fixed tall
            box crowding the short ones. */}
        <div><label className={label}>Caption Direction</label><textarea value={item.captionDirection} onChange={(e) => onChange({ captionDirection: e.target.value })} className={field + " resize-y"} rows={Math.min(6, Math.max(2, Math.ceil((item.captionDirection || "").length / 60)))} /></div>
        <div><label className={label}>CTA</label><input value={item.cta} onChange={(e) => onChange({ cta: e.target.value })} className={field} placeholder="เช่น จองโต๊ะ / สั่งเลย" /></div>
        <div><label className={label}>Product / Menu Highlight</label><input value={item.productHighlight} onChange={(e) => onChange({ productHighlight: e.target.value })} className={field} /></div>
        <div><label className={label}>Mandatory Text</label><input value={item.mandatoryText} onChange={(e) => onChange({ mandatoryText: e.target.value })} className={field} placeholder="ข้อความบังคับ เช่น เงื่อนไขโปร" /></div>
        <div className="md:col-span-2"><label className={label}>Do / Don&apos;t</label><input value={item.doDont} onChange={(e) => onChange({ doDont: e.target.value })} className={field} /></div>
        <div><label className={label}>Reference Brief Link <span className="text-faint font-normal">· optional</span></label><input value={item.referenceBriefLink} onChange={(e) => onChange({ referenceBriefLink: e.target.value })} className={field} placeholder="https://… (ใส่ทีหลังได้)" /></div>
        <div><label className={label}>Reference Image Link</label><input value={item.referenceImageLink} onChange={(e) => onChange({ referenceImageLink: e.target.value })} className={field} placeholder="https://…" /></div>
        <div><label className={label}>Google Drive Link</label><input value={item.driveLink} onChange={(e) => onChange({ driveLink: e.target.value })} className={field} placeholder="https://drive…" /></div>
        <div><label className={label}>Competitor / Inspiration Link</label><input value={item.competitorLink} onChange={(e) => onChange({ competitorLink: e.target.value })} className={field} placeholder="https://…" /></div>
        <div className="md:col-span-2"><label className={label}>Note</label><input value={item.note} onChange={(e) => onChange({ note: e.target.value })} className={field} /></div>
      </div>
    </div>
  );
}

/** How many pieces of artwork this item will actually cost, updated as sizes are
 *  ticked. It reads the same rule the Artwork Count report bills by
 *  (artworkUnitsOf): one piece per distinct size, platform collapsed — the same
 *  size on Facebook and Instagram is one file used twice. Shown while planning
 *  because that is when the number can still be changed. */
function ArtworkCounter({ assets }: { assets: { platform: string; size: string }[] }) {
  const sized = assets.filter((a) => a.size.trim());
  const pieces = artworkUnitsOf(sized);
  // With no size chosen yet the request is still one piece of work, but the
  // count isn't settled — say so rather than showing a firm "1".
  const provisional = sized.length === 0;
  return (
    <span
      className="text-[11px] font-bold rounded-pill px-2.5 py-[3px] whitespace-nowrap"
      style={{ background: "#FBF1E9", color: "#C2691E" }}
      title="นับตามไซซ์ที่ต่างกัน · ไซซ์เดียวกันหลาย platform = 1 ชิ้น (ไฟล์เดียวใช้ซ้ำ) · ใช้เกณฑ์เดียวกับ Artwork Count ที่ใช้ตรวจใบวางบิล"
    >
      🎨 {provisional ? "≈ 1 ชิ้นงาน (ยังไม่เลือกไซซ์)" : `${pieces} ชิ้นงาน`}
    </span>
  );
}
