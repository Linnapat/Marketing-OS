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

export type OmdStorePromotionStatus = "active" | "upcoming" | "ended" | "open_end";

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
    printLabel: "OMD Member / CRM",
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
