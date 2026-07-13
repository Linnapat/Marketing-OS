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
  category: OmdStorePromotionCategory;
  title: string;
  description: string;
  posName: string;
  branches: string[];
  startDate: string;
  endDate?: string;
  periodDays?: number;
  status: OmdStorePromotionStatus;
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

export const OMD_STORE_PROMOTIONS: OmdStorePromotion[] = [
  {
    id: "omd-web-order-trio",
    category: "campaign",
    title: "Website Ordering Campaign",
    description: "สั่งก่อนรับที่หลัง / Order Now Pick Up Later. Option 1 ซื้อครบ 3 เมนู Kaisen Don, Bara Chirashi Don, Salmon Dice Don ฟรี Salmon Don. Option 2 ซื้อครบ 3 เมนู Kaisen Don, Bara Chirashi Don, Aburi Wagyu Don ฟรี Salmon Don.",
    posName: "Exclusive For Website Ordering >> Signature Trio Don Set / Wagyu Choice Don Set",
    branches: ["PS"],
    startDate: "2026-06-23",
    endDate: "2026-08-31",
    status: "active",
  },
  {
    id: "omd-kinmedai",
    category: "must_eat",
    title: "Kinmedai Must Eat",
    description: "Kinmedai Zuwai Kani Don 580 THB, Kinmedai Kaisen Don 350 THB, Kinmedai Sashimi 250 THB.",
    posName: "Must Eat >> Menu Name / Delivery >> [D] Menu Name",
    branches: ["IC", "DK", "CTW", "PS", "TDPK", "CTP"],
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    periodDays: 62,
    status: "active",
  },
  {
    id: "omd-hidden-menu",
    category: "must_eat",
    title: "Hidden Menu",
    description: "Salmon Umami Don 220 THB และ Ikageso 60 THB.",
    posName: "Must Eat >> Salmon Umami Don, Ikageso",
    branches: ["IC", "DK", "CTW", "PS", "TDPK", "CTP"],
    startDate: "2026-05-26",
    status: "open_end",
  },
  {
    id: "omd-happy-hour",
    category: "drinks",
    title: "Happy Hour",
    description: "Happy Hour 17.00 เป็นต้นไป.",
    posName: "",
    branches: ["PS", "TDPK"],
    startDate: "2025-12-01",
    status: "open_end",
  },
  {
    id: "omd-officer-discount",
    category: "promotion",
    title: "Officer Discount 10% + Hello Neighbor",
    description: "ลูกค้าออฟฟิศหรือบริษัทที่เข้าร่วม เมื่อทานครบ 300 บาทขึ้นไป ลด 10%.",
    posName: "PROMOTION >> [Pro] Officer Discount 10%",
    branches: ["PS", "TDG", "CTW", "CTP", "CTPK"],
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    periodDays: 365,
    status: "active",
  },
  {
    id: "omd-uob",
    category: "promotion",
    title: "UOB Point Redemption",
    description: "แลกพ้อยท์ 799 คะแนน รับส่วนลด 100 บาท หรือ 399 คะแนน รับส่วนลด 50 บาท ไม่จำกัดจำนวนครั้ง ใช้แอป Slash ในการ tracking ยอด redeem.",
    posName: "PROMOTION >> UOB Discount 100",
    branches: ["CTP"],
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    periodDays: 184,
    status: "active",
  },
  {
    id: "omd-ttb",
    category: "promotion",
    title: "TTB Discount",
    description: "ซื้อขั้นต่ำ 300 บาท รับส่วนลด 10%. รับเครดิตเงินคืน 100 บาท เมื่อมียอดใช้จ่ายครบ 1,200 บาทขึ้นไป / เซลล์สลิป.",
    posName: "PROMOTION >> UOB Discount 100",
    branches: ["IC", "DK", "PS", "TDG", "CTW", "CTP"],
    startDate: "2026-03-01",
    endDate: "2026-09-30",
    periodDays: 214,
    status: "active",
  },
  {
    id: "omd-ctpk-tumbler",
    category: "special_campaign",
    title: "Central Pinklao Grand Opening Gift",
    description: "Exclusive Gift: Limited-Edition Tumbler.",
    posName: "",
    branches: ["CTPK"],
    startDate: "2026-07-11",
    endDate: "2026-07-18",
    status: "active",
  },
  {
    id: "omd-ctpk-exclusive-menu",
    category: "special_campaign",
    title: "Central Pinklao Grand Opening Menu",
    description: "Salmon & Saba Set 320 THB, Buta & Saba Set 320 THB, Tokumori Kaisen Don O 320 THB.",
    posName: "",
    branches: ["CTPK"],
    startDate: "2026-07-11",
    status: "open_end",
  },
  {
    id: "omd-ctpk-flyer",
    category: "special_campaign",
    title: "Flyer Discount 10%",
    description: "ส่วนลดจาก flyer สำหรับ Central Pinklao.",
    posName: "",
    branches: ["CTPK"],
    startDate: "2026-07-11",
    endDate: "2026-08-31",
    status: "active",
  },
  {
    id: "omd-yamete-sticker",
    category: "delivery_takeaway",
    title: "Yamete Sticker",
    description: "แจกสติกเกอร์น้องแมว สำหรับ Delivery / Takeaway.",
    posName: "",
    branches: ["IC", "DK", "PS", "CTW", "TDPK", "CTPK"],
    startDate: "2026-06-01",
    status: "open_end",
  },
  {
    id: "omd-takeaway-20-boxes",
    category: "delivery_takeaway",
    title: "OMD Takeaway 20 Boxes",
    description: "สั่งครบ 20 กล่อง ส่งฟรีภายในรัศมี 5 กิโลเมตร ทุกสาขา สั่งผ่านแอดมิน Line @Omakasedon.",
    posName: "",
    branches: ["All Branch"],
    startDate: "2026-04-01",
    endDate: "2026-06-30",
    periodDays: 91,
    status: "ended",
  },
  {
    id: "omd-big-cleaning",
    category: "big_cleaning",
    title: "Big Cleaning",
    description: "Cleaning.",
    posName: "",
    branches: ["DK", "IC"],
    startDate: "2026-07-08",
    endDate: "2026-07-08",
    periodDays: 1,
    status: "ended",
  },
  {
    id: "omd-crm-new-member",
    category: "crm",
    title: "New Member Takowasabi",
    description: "OMD Member: New Member รับฟรี Takowasabi.",
    posName: "PROMOTION >> Takowasa For New Member",
    branches: ["All Branch"],
    startDate: "2026-06-29",
    endDate: "2026-12-31",
    status: "active",
  },
  {
    id: "omd-crm-point-omakase",
    category: "crm",
    title: "Point Redemption 200 Point",
    description: "Point redemption 200 point for Omakase Don 250 THB.",
    posName: "PROMOTION >> Point redemption 200 point for Omakase Don 250 THB",
    branches: ["All Branch"],
    startDate: "2025-09-01",
    endDate: "2026-12-31",
    status: "active",
  },
  {
    id: "omd-crm-cash-coupon-50",
    category: "crm",
    title: "50 THB Cash Coupon",
    description: "OMD Member cash coupon.",
    posName: "PROMOTION >> 50 THB cash coupon",
    branches: ["All Branch"],
    startDate: "2025-09-01",
    endDate: "2026-12-31",
    status: "active",
  },
  {
    id: "omd-crm-cash-coupon-100",
    category: "crm",
    title: "Special Day 100 THB Cash Coupon",
    description: "Special day cash coupon.",
    posName: "PROMOTION >> 100 THB cash coupon",
    branches: ["All Branch"],
    startDate: "2025-09-01",
    endDate: "2026-12-31",
    status: "active",
  },
  {
    id: "omd-crm-birthday",
    category: "crm",
    title: "Birthday Don",
    description: "Birthday รับสิทธิแลก Don ในเดือนเกิด มูลค่า 200 บาท.",
    posName: "CRM PROMOTION >> Birthday don",
    branches: ["All Branch"],
    startDate: "2025-09-22",
    endDate: "2026-12-31",
    status: "active",
  },
  {
    id: "omd-crm-must-eat",
    category: "crm",
    title: "Must Eat Discount 10% For CRM",
    description: "ส่วนลด Must Eat 10% สำหรับ CRM.",
    posName: "",
    branches: ["All Branch"],
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    status: "active",
  },
];

export const OMD_STORE_SYNC_CONTRACT = {
  module: "campaigns.omd-store-print",
  source: "Marketing-OS Campaign",
  mode: "on-demand",
  approvalEvents: ["campaign.approved", "campaign.updated"],
  requiredFields: ["title", "category", "branches", "startDate", "endDate", "posName"],
};
