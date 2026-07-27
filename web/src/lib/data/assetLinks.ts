/* Turning an asset link into something the Content Plan can show and download.
 *
 * Creative submits whatever URL they have — a Google Drive file, a Drive
 * "open?id=" share link, a direct .png, a Figma/Canva page. The Content Plan
 * only ever had "Open ↗", which meant a round trip to Drive just to see whether
 * the artwork was the right one, and no way to grab the file for a manual post.
 * These helpers derive a thumbnail and a download URL where the shape of the
 * link makes that possible, and say so honestly when it does not. */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;

/** The file id of a Google Drive *file* link, in any of the shapes Drive hands
 *  out. Folders return null — a folder has no thumbnail and no single file to
 *  download. Docs/Sheets/Slides links do too: they live on docs.google.com and
 *  do not answer the uc?export=download endpoint. */
export function driveFileId(link: string): string | null {
  const url = (link || "").trim();
  if (!/^https?:\/\/drive\.google\.com\//i.test(url)) return null;
  if (/\/drive\/(u\/\d+\/)?folders\//i.test(url)) return null;
  const path = url.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (path) return path[1];
  const query = url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return query ? query[1] : null;
}

/** True for links that resolve to image bytes, so an <img> can render them. */
export function isDirectImage(link: string): boolean {
  const url = (link || "").trim();
  return /^https?:\/\//i.test(url) && IMAGE_EXT.test(url);
}

export interface AssetLinkView {
  /** The link as submitted — always the "Open ↗" target. */
  href: string;
  /** Image URL to render as a thumbnail, or null when not previewable. */
  previewUrl: string | null;
  /** URL that starts a file download, or null when the host has no such URL
   *  (Figma / Canva / Notion pages must be opened instead). */
  downloadUrl: string | null;
  /** Suggested filename for the download attribute; "" when unknown. */
  fileName: string;
}

export function assetLinkView(link: string): AssetLinkView {
  const href = (link || "").trim();
  if (!/^https?:\/\//i.test(href)) return { href, previewUrl: null, downloadUrl: null, fileName: "" };

  const id = driveFileId(href);
  if (id) {
    return {
      href,
      // Drive's thumbnail endpoint renders images, PDFs and videos alike and
      // needs no API key for a file shared by link.
      previewUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      fileName: "",
    };
  }

  if (isDirectImage(href)) {
    const name = decodeURIComponent(href.split(/[?#]/)[0].split("/").pop() || "");
    return { href, previewUrl: href, downloadUrl: href, fileName: name };
  }

  return { href, previewUrl: null, downloadUrl: null, fileName: "" };
}

/** The post's hero image — the first asset that can actually be previewed.
 *  Falls back to the pasted media link, so a post with no graphic request but a
 *  Drive link still shows its artwork. */
export function heroPreview(
  assets: { link: string }[] | undefined,
  mediaLink?: string,
): { previewUrl: string; href: string } | null {
  for (const a of assets ?? []) {
    const view = assetLinkView(a.link);
    if (view.previewUrl) return { previewUrl: view.previewUrl, href: view.href };
  }
  if (mediaLink) {
    const view = assetLinkView(mediaLink);
    if (view.previewUrl) return { previewUrl: view.previewUrl, href: view.href };
  }
  return null;
}
