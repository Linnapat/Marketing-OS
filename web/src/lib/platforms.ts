// SNS platform icon badges — reused wherever a platform is shown as a colored chip.

export interface PlatformIcon { icon: string; bg: string; fg: string; }

export const PLATFORM_ICON: Record<string, PlatformIcon> = {
  Instagram: { icon: "IG", bg: "#E1306C", fg: "#fff" },
  TikTok: { icon: "TK", bg: "#010101", fg: "#fff" },
  Facebook: { icon: "FB", bg: "#1877F2", fg: "#fff" },
  "LINE OA": { icon: "LN", bg: "#06C755", fg: "#fff" },
  "Google Map": { icon: "GM", bg: "#4285F4", fg: "#fff" },
  YouTube: { icon: "YT", bg: "#FF0000", fg: "#fff" },
};

export function platformIcon(name: string): PlatformIcon {
  return PLATFORM_ICON[name] ?? { icon: "??", bg: "#ccc", fg: "#fff" };
}

/** Build a real channel URL from a platform + @handle (or return a full URL as-is).
 *  Returns null for empty / placeholder handles so callers can skip the link. */
export function channelUrl(platform: string, handle: string): string | null {
  const h = (handle || "").trim();
  if (!h || h.toLowerCase() === "@tbd") return null;
  if (/^https?:\/\//i.test(h)) return h;
  const user = h.replace(/^@/, "").trim();
  if (!user) return null;
  switch (platform) {
    case "Instagram": return `https://instagram.com/${user}`;
    case "TikTok": return `https://tiktok.com/@${user}`;
    case "Facebook": return `https://facebook.com/${user}`;
    case "YouTube": return `https://youtube.com/@${user}`;
    case "X": return `https://x.com/${user}`;
    default: return `https://instagram.com/${user}`;
  }
}
