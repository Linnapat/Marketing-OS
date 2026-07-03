// Request Center + Approval Queue + Asset Library — shared request/asset data,
// built from the Marketing OS v2 spec (central Request Center, 9-stage Approval
// pipeline, Asset Library with Drive/Canva links).

import { BrandId } from "@/lib/brands";
import { Tone } from "@/lib/status";

export const REQUEST_TYPES = [
  { key: "graphic", label: "Graphic", icon: "🎨" },
  { key: "content", label: "Content", icon: "✍️" },
  { key: "kol", label: "KOL", icon: "🌟" },
  { key: "campaign", label: "Campaign", icon: "🎯" },
  { key: "budget", label: "Budget", icon: "฿" },
  { key: "photo", label: "Photo / Video Shooting", icon: "📸" },
  { key: "report", label: "Report", icon: "📊" },
  { key: "menu", label: "Menu / Promotion Brief", icon: "🍱" },
];

export interface RequestRow {
  id: string;
  type: string;
  typeIcon: string;
  title: string;
  b: BrandId;
  campaign: string;
  requester: string;
  approver: string;
  due: string;
  stage: string;
  priority: "High" | "Med" | "Low";
}

export const REQUESTS: RequestRow[] = [
  { id: "REQ-0001", type: "Graphic", typeIcon: "🎨", title: "Songkran key visual", b: "teppen", campaign: "Songkran Teppanyaki", requester: "Ken S.", approver: "Aran P.", due: "Jul 2", stage: "CMO Review", priority: "High" },
  { id: "REQ-0002", type: "Budget", typeIcon: "฿", title: "Rainy Season media budget", b: "mainichi", campaign: "Rainy Season Promo", requester: "Nok W.", approver: "Aran P.", due: "Jul 3", stage: "Submitted", priority: "High" },
  { id: "REQ-0003", type: "KOL", typeIcon: "🌟", title: "Tokyo Tom contract", b: "teppen", campaign: "Wagyu Festival", requester: "Ken S.", approver: "Aran P.", due: "Jul 5", stage: "Revision", priority: "Med" },
  { id: "REQ-0004", type: "Content", typeIcon: "✍️", title: "Cocktail reel caption set", b: "touka", campaign: "Cocktail Hour Launch", requester: "Ploy R.", approver: "Ken S.", due: "Jul 4", stage: "Approved", priority: "Med" },
  { id: "REQ-0005", type: "Photo / Video Shooting", typeIcon: "📸", title: "Father's Day menu shoot", b: "omakase", campaign: "Father's Day Set", requester: "Ken S.", approver: "Aran P.", due: "Jun 28", stage: "Scheduled", priority: "Low" },
  { id: "REQ-0006", type: "Campaign", typeIcon: "🎯", title: "Touka Anniversary plan", b: "touka", campaign: "Touka Anniversary", requester: "Ploy R.", approver: "Aran P.", due: "Aug 1", stage: "Draft", priority: "Med" },
  { id: "REQ-0007", type: "Report", typeIcon: "📊", title: "LINE Coupon post-mortem", b: "mainichi", campaign: "LINE Coupon Drive", requester: "Nok W.", approver: "Aran P.", due: "Jun 20", stage: "Reported", priority: "Low" },
  { id: "REQ-0008", type: "Graphic", typeIcon: "🎨", title: "Wagyu key visual V2", b: "teppen", campaign: "Wagyu Festival", requester: "Ken S.", approver: "Aran P.", due: "Jun 29", stage: "Published", priority: "High" },
  { id: "REQ-0009", type: "Menu / Promotion Brief", typeIcon: "🍱", title: "Summer set menu brief", b: "omakase", campaign: "Summer Reel Series", requester: "Ken S.", approver: "Ken S.", due: "Jul 6", stage: "Result Uploaded", priority: "Med" },
];

// 9-stage approval pipeline
export const APPROVAL_STAGES = [
  "Draft", "Submitted", "CMO Review", "Revision", "Approved",
  "Scheduled", "Published", "Result Uploaded", "Reported",
];

export const STAGE_TONE: Record<string, Tone> = {
  Draft: "neutral", Submitted: "blue", "CMO Review": "gold", Revision: "orange",
  Approved: "green", Scheduled: "blue", Published: "green", "Result Uploaded": "blue", Reported: "ink",
};

export const PRIORITY_TONE: Record<string, Tone> = { High: "red", Med: "gold", Low: "neutral" };

// ── Asset Library ──────────────────────────────────────────────────
export interface Asset {
  id: string;
  name: string;
  b: BrandId;
  campaign: string;
  type: string;
  version: string;
  approval: string;
  driveUrl: string;
  canvaUrl: string;
  updated: string;
}

export const ASSETS: Asset[] = [
  { id: "AST-001", name: "Wagyu Key Visual", b: "teppen", campaign: "Wagyu Festival", type: "Key Visual", version: "V2", approval: "Approved", driveUrl: "#", canvaUrl: "#", updated: "Jun 27" },
  { id: "AST-002", name: "Wagyu Teaser Story", b: "teppen", campaign: "Wagyu Festival", type: "Story", version: "Final", approval: "Approved", driveUrl: "#", canvaUrl: "#", updated: "Jun 21" },
  { id: "AST-003", name: "Cocktail Menu Card", b: "touka", campaign: "Cocktail Hour Launch", type: "Print", version: "Final", approval: "Approved", driveUrl: "#", canvaUrl: "", updated: "Jun 23" },
  { id: "AST-004", name: "Father's Day Banner", b: "omakase", campaign: "Father's Day Set", type: "Social Media", version: "V2", approval: "Waiting", driveUrl: "#", canvaUrl: "#", updated: "Jun 26" },
  { id: "AST-005", name: "Summer Reel Cover", b: "omakase", campaign: "Summer Reel Series", type: "Reel Cover", version: "V3", approval: "Revision", driveUrl: "#", canvaUrl: "#", updated: "Jun 22" },
  { id: "AST-006", name: "Lunch Set Carousel", b: "mainichi", campaign: "Rainy Season Promo", type: "Carousel", version: "V1", approval: "Draft", driveUrl: "", canvaUrl: "#", updated: "Jun 25" },
  { id: "AST-007", name: "Matcha Dessert Post", b: "mainichi", campaign: "LINE Coupon Drive", type: "Social Media", version: "Final", approval: "Approved", driveUrl: "#", canvaUrl: "#", updated: "Jun 5" },
  { id: "AST-008", name: "LINE Coupon Card", b: "mainichi", campaign: "LINE Coupon Drive", type: "LINE Rich Message", version: "V1", approval: "Waiting", driveUrl: "#", canvaUrl: "", updated: "Jun 25" },
];

export const ASSET_APPROVAL_TONE: Record<string, Tone> = {
  Approved: "green", Waiting: "gold", Revision: "orange", Draft: "neutral",
};
