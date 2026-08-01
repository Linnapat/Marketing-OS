// Colour vocabulary for the KOL library. Three independent scales that must not
// be confused with each other:
//   tier     — audience size, cool → warm. NOT a quality ranking.
//   category — what they make. Arbitrary hues, only needs to be distinguishable.
//   platform — the brand colours everyone already recognises.
// Quality is judged by Cost/Reach and Reach/Follower, never by a colour.

export const KOL_TIERS = ["Nano", "Micro", "Mid", "Macro", "Mega"] as const;

export interface Tone { bg: string; border: string; fg: string }

const TIER_TONE: Record<string, Tone> = {
  Nano:  { bg: "#EEF4EE", border: "#CFE4C2", fg: "#3F6A34" },
  Micro: { bg: "#EEF1F8", border: "#D5DEEF", fg: "#3E5C9A" },
  Mid:   { bg: "#F3EEF8", border: "#DDD0EA", fg: "#6B4A93" },
  Macro: { bg: "#FBF6EC", border: "#EADBC1", fg: "#8A6D1E" },
  Mega:  { bg: "#FFF5F4", border: "#F5C8C4", fg: "#B33A2E" },
};

export function tierTone(tier: string | null | undefined): Tone {
  return TIER_TONE[tier ?? ""] ?? { bg: "#F5F3EF", border: "#E3DED4", fg: "#6b6258" };
}

// The categories actually present in the library get a fixed hue so they stay
// put as rows are filtered; anything new falls back to a hashed pick from the
// same palette rather than a grey nobody can tell apart.
const CATEGORY_TONE: Record<string, Tone> = {
  "Food Review":        { bg: "#FDF0E7", border: "#F3D3BC", fg: "#B4622A" },
  "Lifestyle":          { bg: "#EAF3F6", border: "#C6E0E8", fg: "#2F7183" },
  "Celebrity":          { bg: "#F8EDF3", border: "#EBCBDD", fg: "#9D3D6B" },
  "Coach":              { bg: "#EDF3EC", border: "#CCE1C7", fg: "#456F3D" },
  "Athlete":            { bg: "#EEF0F7", border: "#D2D7EB", fg: "#4A5391" },
  "Japanese Community": { bg: "#F6EFE6", border: "#E5D3BB", fg: "#8A6231" },
  "Nightlife":          { bg: "#F0EDF7", border: "#D6CFEB", fg: "#5B4A93" },
  "KOC / Staff":        { bg: "#F0F2F1", border: "#D5DAD8", fg: "#566461" },
};

const FALLBACK: Tone[] = Object.values(CATEGORY_TONE);

export function categoryTone(category: string | null | undefined): Tone {
  const key = (category ?? "").trim();
  if (!key) return { bg: "#F5F3EF", border: "#E3DED4", fg: "#8b8378" };
  if (CATEGORY_TONE[key]) return CATEGORY_TONE[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

/** Creators we have a real relationship with — repeat bookings, settled terms. */
export const PARTNER_TONE: Tone = { bg: "#EAF4EC", border: "#BEDCC4", fg: "#2F6B41" };
