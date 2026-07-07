// Canonical finance category names — the ones the budget Google Sheet is aliased
// to. Campaign budget buckets (coarse) and ad platforms are mapped onto these so
// a campaign's expense drafts land in the SAME category the sheet budgets, and
// the P&L by Category lines up actual vs budget exactly.

/** Campaign brief budget bucket label → canonical category. "Ads" is handled
 *  separately via the per-platform split below (it has no single category). */
export const BUCKET_TO_CATEGORY: Record<string, string> = {
  "KOL": "KOL / Influencer",
  "Graphic / Production": "Food cost / Photo shoot",
  "Printing / POSM": "Printing / POSM",
  "CRM / LINE OA": "LINE Broadcast",
  "Other": "Other",
};

/** Ads platform label (ADS_PLATFORMS) → canonical category. */
export const ADS_PLATFORM_TO_CATEGORY: Record<string, string> = {
  "Facebook / Instagram": "Facebook / Instagram Ads",
  "TikTok": "TikTok Ads",
  "Google": "Google Ads / PPC",
  "LINE Ads": "LINE Ads",
  "Other": "Other",
};

export const canonicalBucket = (label: string): string => BUCKET_TO_CATEGORY[label] ?? label;
export const canonicalAdsPlatform = (platform: string): string => ADS_PLATFORM_TO_CATEGORY[platform] ?? platform;
