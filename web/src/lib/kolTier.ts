// Tier colours. Deliberately a cool→warm ramp rather than a good/bad scale:
// a Mega creator is not "better" than a Nano one, they are a different bet, and
// the Cost/Reach column is where quality actually gets judged.

export const KOL_TIERS = ["Nano", "Micro", "Mid", "Macro", "Mega"] as const;

const TIER_TONE: Record<string, { bg: string; border: string; fg: string }> = {
  Nano:  { bg: "#EEF4EE", border: "#CFE4C2", fg: "#3F6A34" },
  Micro: { bg: "#EEF1F8", border: "#D5DEEF", fg: "#3E5C9A" },
  Mid:   { bg: "#F3EEF8", border: "#DDD0EA", fg: "#6B4A93" },
  Macro: { bg: "#FBF6EC", border: "#EADBC1", fg: "#8A6D1E" },
  Mega:  { bg: "#FFF5F4", border: "#F5C8C4", fg: "#B33A2E" },
};

export function tierTone(tier: string | null | undefined) {
  return TIER_TONE[tier ?? ""] ?? { bg: "#F5F3EF", border: "#E3DED4", fg: "#6b6258" };
}
