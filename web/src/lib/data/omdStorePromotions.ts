import type { BrandId } from "@/lib/brands";

export type OmdStorePromotionCategory =
  | "campaign"
  | "must_eat"
  | "drinks"
  | "promotion"
  | "special_campaign"
  | "delivery_takeaway"
  | "big_cleaning"
  | "crm";

/** "cancelled" is not "ended": a promotion Marketing pulled must never go on a
 *  wall, whether its dates have passed or have not arrived yet. Everything else
 *  here is a fact about the dates and is recomputed at render time — see
 *  liveStatus in the print page. */
export type OmdStorePromotionStatus = "active" | "upcoming" | "ended" | "open_end" | "cancelled";

export interface OmdStorePromotion {
  id: string;
  brand: BrandId;
  category: OmdStorePromotionCategory;
  title: string;
  description: string;
  posName: string;
  branches: string[];
  startDate: string;
  endDate?: string;
  periodDays?: number;
  status: OmdStorePromotionStatus;
  source?: "campaign" | "manual" | "seed";
  /** Kept out of the printout. A campaign row can only be hidden, never deleted —
   *  the campaign belongs to another module — so "remove from the sheet" is
   *  stored as this flag and can be undone. */
  hidden?: boolean;
}

/** What the shop floor actually needs from the Status column: is this on the
 *  wall today?
 *
 *  The stored status is a snapshot — written when a manual promotion was saved,
 *  or copied from the campaign's workflow state — and a snapshot goes stale the
 *  moment the calendar moves. Deriving from the dates on every read is what
 *  keeps the column honest, and it is the only reading under which a promotion
 *  cannot be finished before it has started: a campaign someone had marked
 *  Completed printed "จบแล้ว" while its flight was still a week away.
 *
 *  Cancelled is the one thing the dates cannot tell you, so it survives; a
 *  stored "ended" is read as closed-early and applies only once the promotion
 *  has actually started.
 *
 *  `today` is passed in (yyyy-mm-dd, local) rather than read here, so callers
 *  stay pure and this stays testable. */
export function printedStatus(
  item: Pick<OmdStorePromotion, "status" | "startDate" | "endDate">,
  today: string,
): OmdStorePromotionStatus {
  if (item.status === "cancelled") return "cancelled";
  if (item.startDate && item.startDate > today) return "upcoming";
  if (item.endDate && item.endDate < today) return "ended";
  if (item.status === "ended") return "ended";
  if (!item.endDate) return "open_end";
  return "active";
}

export const OMD_STORE_CATEGORY_META: Record<OmdStorePromotionCategory, {
  label: string;
  printLabel: string;
  bg: string;
  fg: string;
  border: string;
}> = {
  campaign: {
    label: "Campaign",
    printLabel: "Website / Campaign",
    bg: "#EEE9FF",
    fg: "#5B4FD8",
    border: "#CFC7FF",
  },
  must_eat: {
    label: "Must Eat",
    printLabel: "Must Eat / Menu Push",
    bg: "#EAF1FF",
    fg: "#3E5C9A",
    border: "#BFD0F4",
  },
  drinks: {
    label: "Drinks",
    printLabel: "Drinks",
    bg: "#E3F7F5",
    fg: "#0EA5A0",
    border: "#B8E8E4",
  },
  promotion: {
    label: "Promotion",
    printLabel: "Promotion / Bank / Office",
    bg: "#FFF3D7",
    fg: "#9B6C16",
    border: "#E8C87D",
  },
  special_campaign: {
    label: "Special Campaign",
    printLabel: "Special Campaign / Opening",
    bg: "#FDEBF3",
    fg: "#C75A91",
    border: "#F1BAD4",
  },
  delivery_takeaway: {
    label: "Delivery / Takeaway",
    printLabel: "Delivery / Takeaway",
    bg: "#EAF8EE",
    fg: "#4BA06B",
    border: "#BFE5CC",
  },
  big_cleaning: {
    label: "Big Cleaning",
    printLabel: "Operation",
    bg: "#F4F2F8",
    fg: "#706A84",
    border: "#D8D4E4",
  },
  crm: {
    label: "CRM",
    // Brand-neutral on purpose: this sheet prints for every brand, and a Teppen
    // CRM promotion filed under a heading that says OMD reads as the wrong
    // brand's offer to anyone holding the printout.
    printLabel: "Member / CRM",
    bg: "#FFF0F0",
    fg: "#D95454",
    border: "#F4B6B6",
  },
};

export const OMD_STORE_PROMOTIONS: OmdStorePromotion[] = [];

export const OMD_STORE_SYNC_CONTRACT = {
  module: "campaigns.omd-store-print",
  source: "Marketing-OS Campaign",
  mode: "on-demand",
  approvalEvents: ["campaign.approved", "campaign.updated"],
  requiredFields: ["brand", "title", "category", "branches", "startDate", "endDate", "posName"],
};
