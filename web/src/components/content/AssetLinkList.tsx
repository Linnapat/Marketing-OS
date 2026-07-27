"use client";

import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { assetLinkView, heroPreview } from "@/lib/data/assetLinks";

/** One approved deliverable, shown with its artwork rather than just a URL. */
function AssetRow({ platform, size, link }: { platform: string; size: string; link: string }) {
  const view = assetLinkView(link);
  // Drive thumbnails 404 for files that are not shared "anyone with the link",
  // and a broken <img> is worse than none — fall back to the icon tile.
  const [broken, setBroken] = useState(false);
  const showPreview = !!view.previewUrl && !broken;

  return (
    <div className="rounded-[10px] border-[1.5px] overflow-hidden" style={{ borderColor: "#BFE0C4", background: "#F3FAF3" }}>
      {showPreview && (
        <a href={view.href} target="_blank" rel="noreferrer" className="block bg-white" title="เปิดไฟล์เต็ม">
          <img
            src={view.previewUrl!}
            alt={`${platform} ${size}`.trim()}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="w-full max-h-[220px] object-contain"
          />
        </a>
      )}
      <div className="flex items-center justify-between gap-2 px-[13px] py-[9px]">
        <div className="flex items-center gap-[9px] min-w-0">
          {!showPreview && <span className="text-[14px]">{view.previewUrl ? "🖼" : "🔗"}</span>}
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{platform}</div>
            <div className="text-[11px] text-faint truncate">{size || "—"}</div>
          </div>
        </div>
        <div className="flex items-center gap-[6px] flex-shrink-0">
          {view.downloadUrl && (
            <a
              href={view.downloadUrl}
              // `download` is ignored cross-origin, so Drive's own download
              // endpoint is what actually delivers the file; the attribute only
              // helps for same-origin/direct image links.
              download={view.fileName || undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-[4px] text-[11.5px] font-bold px-[9px] py-[5px] rounded-[8px] text-white"
              style={{ background: "#4E7A4E" }}
            >
              <Download size={12} /> Download
            </a>
          )}
          <a
            href={view.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-[4px] text-[11.5px] font-bold px-[9px] py-[5px] rounded-[8px] border"
            style={{ borderColor: "#BFE0C4", color: "#3F6A34", background: "#fff" }}
          >
            <ExternalLink size={12} /> Open
          </a>
        </div>
      </div>
    </div>
  );
}

/** Row-sized artwork thumbnail for the Content Plan list. Renders nothing when
 *  the post has no previewable asset, so undelivered rows stay clean. */
export function AssetThumb({ assets, mediaLink, size = 34 }: {
  assets?: { link: string }[];
  mediaLink?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const hero = heroPreview(assets, mediaLink);
  if (!hero || broken) return null;
  return (
    <img
      src={hero.previewUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="rounded-[7px] object-cover border border-line3 bg-white flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/** Approved assets attached from the Graphic Request module, with a preview and
 *  a download for each. Renders the empty-state copy when nothing is attached. */
export function AssetLinkList({ assets, emptyLabel }: {
  assets?: { platform: string; size: string; link: string }[];
  emptyLabel?: string;
}) {
  const usable = (assets ?? []).filter((a) => a.link?.trim());
  if (!usable.length) {
    return (
      <div className="text-[12px] text-faint px-[13px] py-[10px] rounded-[10px]" style={{ background: "#F7F4EE" }}>
        {emptyLabel ?? "ยังไม่มี asset — จะแนบอัตโนมัติเมื่อทีมกราฟฟิกส่งงานและอนุมัติครบทุกชิ้นใน Graphic Request"}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[9px]">
      {usable.map((a, i) => <AssetRow key={`${a.link}-${i}`} platform={a.platform} size={a.size} link={a.link} />)}
    </div>
  );
}
