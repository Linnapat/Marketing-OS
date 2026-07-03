"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ContentItem, contentTone, platIcon, contentWarnings, preflight } from "@/lib/data/content";
import { brandName, brandColor } from "@/lib/brands";
import { StatusBadge } from "@/components/ui/StatusBadge";

const TABS = [["overview", "Overview"], ["caption", "Caption"], ["approval", "Approval"], ["publish", "Publish"]] as const;
type DTab = (typeof TABS)[number][0];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ContentDrawer({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const [tab, setTab] = useState<DTab>("overview");
  const [caption, setCaption] = useState(item.caption);
  const [hashtags, setHashtags] = useState(item.hashtags);
  const [cta, setCta] = useState(item.cta);
  const pi = platIcon(item.plat);
  const warnings = contentWarnings(item);

  const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line2 bg-ivory outline-none font-sans";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[520px] bg-surface flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2 flex-shrink-0" style={{ background: "#FBF9F4" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-[5px] flex-wrap">
              <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[9px] font-bold" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
              <span className="text-[15px] font-extrabold leading-tight">{item.title}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted">
              <span className="flex items-center gap-[5px]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: brandColor(item.b) }} />{brandName(item.b)}</span>
              <span className="text-faint">·</span><span>{item.campaign}</span>
              <span className="text-faint">·</span><span>{MONTHS[6]} {item.day}, {item.time}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line flex-shrink-0 overflow-x-auto">
          {TABS.map(([id, label]) => {
            const active = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)} className="text-[12.5px] font-semibold px-[15px] py-[11px] whitespace-nowrap border-b-2 -mb-[1px]"
                style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-[18px]">
          {tab === "overview" && (
            <div className="flex flex-col gap-[14px]">
              <div className="rounded-[14px] h-40 flex flex-col items-center justify-center gap-2" style={{ background: "#F0EBE0" }}>
                <span className="text-[28px]">🖼</span>
                <span className="text-[13px] text-faint font-semibold">{item.assetStatus}</span>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                {[["Status", <StatusBadge key="s" tone={contentTone(item.status)}>{item.status}</StatusBadge>],
                  ["Owner", <span key="o" className="text-[13.5px] font-semibold">{item.owner}</span>],
                  ["Asset", <StatusBadge key="a" tone={contentTone(item.assetStatus)}>{item.assetStatus}</StatusBadge>],
                  ["Caption", <StatusBadge key="c" tone={contentTone(item.captionStatus)}>{item.captionStatus}</StatusBadge>]].map(([label, node], i) => (
                  <div key={i} className="rounded-[12px] px-[14px] py-3" style={{ background: "#F7F4EE" }}>
                    <div className="text-[10px] font-bold tracking-[0.06em] uppercase text-faint mb-1">{label as string}</div>
                    {node as React.ReactNode}
                  </div>
                ))}
              </div>
              {warnings.length > 0 && (
                <div className="rounded-[12px] px-[14px] py-3" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
                  <div className="text-[11.5px] font-bold text-status-red mb-2">Action needed</div>
                  {warnings.map((w) => (
                    <div key={w} className="text-[12.5px] text-status-red font-semibold mb-[5px] flex items-center gap-[6px]"><span>⚠</span><span>{w}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "caption" && (
            <div className="flex flex-col gap-[14px]">
              <div>
                <div className="flex items-center justify-between mb-[6px]">
                  <label className="text-[11.5px] font-bold text-muted">Caption</label>
                  <StatusBadge tone={contentTone(item.captionStatus)}>{item.captionStatus}</StatusBadge>
                </div>
                <textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write caption here…" className={`${field} resize-y leading-[1.5]`} />
                <div className="text-[11px] text-faint mt-1 text-right">{caption.length} chars</div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Hashtags</label>
                <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#wagyu #bangkok #teppen" className={field} />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Call to Action</label>
                <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Reserve now via link in bio" className={field} />
              </div>
              <div className="flex gap-2">
                <button className="flex-1 text-[13.5px] font-bold py-[11px] rounded-[10px] bg-panel text-white">Save Caption</button>
                <button className="text-[13.5px] font-semibold py-[11px] px-4 rounded-[10px] border border-line2 text-muted">Mark Ready</button>
              </div>
              <div className="text-[11.5px] text-faint">Last edited by {item.owner}</div>
            </div>
          )}

          {tab === "approval" && (
            <div className="flex flex-col gap-[14px]">
              <div className="rounded-[14px] p-4" style={{ background: "#F7F4EE" }}>
                <div className="text-[12px] font-bold tracking-[0.05em] uppercase text-faint mb-[10px]">Approval Status</div>
                <StatusBadge tone={contentTone(item.approvalStatus)}>{item.approvalStatus}</StatusBadge>
                <div className="text-[12.5px] text-faint mt-2">0 feedback round(s)</div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] text-white" style={{ background: "#4E7A4E" }}>✓ Approve</button>
                <button className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] border-[1.5px] border-line2 text-status-orange">↩ Request Revision</button>
              </div>
            </div>
          )}

          {tab === "publish" && (
            <div className="flex flex-col gap-[14px]">
              <div className="rounded-[12px] px-[14px] py-3" style={{ background: "#EEF3FF", border: "1px solid #C5D4F8" }}>
                <div className="text-[12px] font-bold mb-1" style={{ color: "#1E3A8A" }}>Future Publish Integration</div>
                <div className="text-[12px]" style={{ color: "#3B6BF5" }}>Meta connection not connected · Ready for future auto-publish once integrated.</div>
              </div>
              <div>
                <div className="text-[11.5px] font-bold text-muted mb-2">Select channels</div>
                <div className="flex flex-col gap-[7px]">
                  {[{ icon: "📘", label: "Facebook Page", sub: "TEPPEN Group" }, { icon: "📸", label: "Instagram Feed", sub: "@teppen.bkk" }, { icon: "🎬", label: "Instagram Reel", sub: "@teppen.bkk" }].map((ch) => (
                    <div key={ch.label} className="flex items-center justify-between px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line3 bg-surface">
                      <div className="flex items-center gap-[9px]"><span className="text-[15px]">{ch.icon}</span><div><div className="text-[13px] font-semibold">{ch.label}</div><div className="text-[11px] text-faint">{ch.sub}</div></div></div>
                      <StatusBadge tone="neutral">Not connected</StatusBadge>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                <div><label className="block text-[11.5px] font-bold text-muted mb-[5px]">Schedule Date</label><input type="date" className={field} /></div>
                <div><label className="block text-[11.5px] font-bold text-muted mb-[5px]">Schedule Time</label><input type="time" defaultValue={item.time} className={field} /></div>
              </div>
              <div>
                <div className="text-[11.5px] font-bold text-muted mb-2">Preflight checklist</div>
                <div className="flex flex-col gap-[6px]">
                  {preflight(item).map((pf) => (
                    <div key={pf.label} className="flex items-center gap-[9px] px-[12px] py-2 rounded-[9px]" style={{ background: "#F7F4EE" }}>
                      <span className="text-[13px]">{pf.ok ? "✅" : "⬜"}</span>
                      <span className="text-[12.5px] font-medium" style={{ color: pf.ok ? "#4E7A4E" : "#9A9387" }}>{pf.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button className="text-[13.5px] font-bold py-3 rounded-[11px] cursor-not-allowed" style={{ background: "#E8E2D6", color: "#9A9387" }}>Auto-publish available after Meta connection</button>
              <button className="text-[13.5px] font-bold py-3 rounded-[11px] bg-panel text-white">Save Schedule · Manual Post</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
