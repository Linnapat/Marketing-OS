// Finance — ported from Finance.dc.html. The design keeps Finance deliberately separate
// from campaign-planning budgets; ROI = (GP − cost)/cost and ROAS = revenue/ad-spend are
// reported independently (never the same value unless configured).

import { BrandId, brandName } from "@/lib/brands";
import { Tone } from "@/lib/status";

export interface BudgetItem { name: string; budget: number; actual: number; }
export interface BudgetSection { key: string; label: string; sub: string; items: BudgetItem[]; }

export const BUDGET_SECTIONS: BudgetSection[] = [
  {
    key: "digital", label: "Digital Marketing", sub: "ต้นทุนในการขาย / ค่าโฆษณา", items: [
      { name: "Facebook/Instagram Ads", budget: 550000, actual: 380000 },
      { name: "Google Ads/PPC", budget: 250000, actual: 145000 },
      { name: "SEO", budget: 60000, actual: 48000 },
      { name: "Youtube Ads", budget: 120000, actual: 85000 },
      { name: "Twitter", budget: 30000, actual: 0 },
      { name: "Line Ads", budget: 180000, actual: 165000 },
      { name: "Line Package", budget: 100000, actual: 100000 },
      { name: "Line Broadcast", budget: 60000, actual: 55000 },
      { name: "KOL", budget: 280000, actual: 193000 },
      { name: "Food cost (KOL/Photo)", budget: 90000, actual: 65000 },
      { name: "Voucher", budget: 120000, actual: 42000 },
      { name: "Web advertorial", budget: 60000, actual: 30000 },
      { name: "Event", budget: 100000, actual: 0 },
      { name: "TikTok", budget: 120000, actual: 88000 },
      { name: "SMS", budget: 30000, actual: 0 },
      { name: "Delivery Ads", budget: 60000, actual: 38000 },
      { name: "Chinese Marketing", budget: 40000, actual: 0 },
      { name: "Other", budget: 50000, actual: 16000 },
    ],
  },
  {
    key: "system", label: "System", sub: "Total", items: [
      { name: "Foodie/Hatohub/Loga", budget: 180000, actual: 135000 },
      { name: "Website (Cloud)", budget: 80000, actual: 80000 },
      { name: "Eatlab AI", budget: 80000, actual: 60000 },
      { name: "Shopline", budget: 60000, actual: 45000 },
      { name: "System develop", budget: 80000, actual: 40000 },
      { name: "GP 3% subscription", budget: 40000, actual: 20000 },
    ],
  },
  {
    key: "operation", label: "Operation", sub: "Total", items: [
      { name: "Base salary", budget: 240000, actual: 210000 },
      { name: "Management fee", budget: 80000, actual: 60000 },
      { name: "Position Fee", budget: 60000, actual: 45000 },
      { name: "ค่าเลี้ยงดูบุตร", budget: 20000, actual: 18000 },
      { name: "Phone", budget: 15000, actual: 14000 },
      { name: "Transportation", budget: 20000, actual: 12000 },
      { name: "Food", budget: 25000, actual: 20000 },
      { name: "Point/B (Incentive)", budget: 40000, actual: 15000 },
      { name: "Bonus", budget: 80000, actual: 60000 },
      { name: "OT", budget: 30000, actual: 25000 },
      { name: "SSO (Company)", budget: 40000, actual: 35000 },
      { name: "Creative", budget: 80000, actual: 38000 },
    ],
  },
  {
    key: "outsource", label: "Outsource", sub: "Total", items: [
      { name: "Agency", budget: 250000, actual: 140000 },
      { name: "Partime", budget: 120000, actual: 60000 },
      { name: "Outsource", budget: 80000, actual: 40000 },
    ],
  },
  {
    key: "admin", label: "Administration", sub: "Total", items: [
      { name: "ค่าเช่าออฟฟิศ Marketing", budget: 80000, actual: 80000 },
      { name: "ค่าน้ำ-ค่าไฟ", budget: 20000, actual: 18000 },
      { name: "Tel + Wifi", budget: 15000, actual: 14000 },
      { name: "Miscellaneous", budget: 30000, actual: 12000 },
      { name: "CRM / Customer Mgmt", budget: 50000, actual: 0 },
      { name: "ค่าเสื่อมราคา - ฮาร์ดแวร์", budget: 30000, actual: 15000 },
    ],
  },
];

export const SECTION_ICON: Record<string, string> = {
  digital: "📢", system: "💻", operation: "👥", outsource: "🧩", admin: "🗂",
};

// Budget Plan allocation — per-brand plan vs spent, and by-category totals.
export interface BudgetBrand { b: BrandId; plan: number; spent: number; }
export const BUDGET_BY_BRAND: BudgetBrand[] = [
  { b: "teppen", plan: 1500000, spent: 1120000 },
  { b: "omakase", plan: 1200000, spent: 780000 },
  { b: "mainichi", plan: 900000, spent: 590000 },
  { b: "touka", plan: 900000, spent: 350000 },
];

export const BUDGET_BY_CATEGORY: { name: string; amount: number }[] = [
  { name: "Paid Ads", amount: 980000 },
  { name: "KOL / Creator", amount: 760000 },
  { name: "Production", amount: 620000 },
  { name: "Events", amount: 320000 },
  { name: "Print", amount: 160000 },
];

export interface ExpenseRow { vendor: string; category: string; b: BrandId; amount: number; vat: number; date: string; status: string; reimburseType?: string; wht?: number; }
export const EXPENSES: ExpenseRow[] = [
  { vendor: "Studio Mori", category: "Production", b: "teppen", amount: 85000, vat: 5950, date: "Jun 12", status: "Paid" },
  { vendor: "Meta Ads", category: "Paid Ads", b: "omakase", amount: 42000, vat: 2940, date: "Jun 20", status: "Paid" },
  { vendor: "Nong Aim (KOL)", category: "KOL", b: "teppen", amount: 45000, vat: 0, date: "Jun 25", status: "Pending" },
  { vendor: "Print House BKK", category: "Print", b: "touka", amount: 28000, vat: 1960, date: "Jun 22", status: "Unpaid" },
  { vendor: "LINE Ads", category: "Paid Ads", b: "mainichi", amount: 30000, vat: 2100, date: "May 18", status: "Paid" },
];

export interface RequestRow { category: string; b: BrandId; campaign: string; requested: number; approved: number; due: string; status: string; }
export const REQUESTS: RequestRow[] = [
  { category: "KOL fee", b: "teppen", campaign: "Songkran Teppanyaki", requested: 180000, approved: 150000, due: "Jul 5", status: "Waiting Approval" },
  { category: "Production", b: "omakase", campaign: "Father's Day Set", requested: 80000, approved: 80000, due: "Jun 28", status: "Approved" },
  { category: "Print menus", b: "touka", campaign: "Touka Anniversary", requested: 45000, approved: 0, due: "Jul 10", status: "Waiting Approval" },
  { category: "Paid ads", b: "mainichi", campaign: "LINE Coupon Drive", requested: 30000, approved: 30000, due: "May 20", status: "Paid" },
  { category: "Event setup", b: "teppen", campaign: "Wagyu Festival", requested: 120000, approved: 100000, due: "Jun 30", status: "Approved" },
];

export interface PnlRow { name: string; b: BrandId; revenue: number; budget: number; expense: number; roi: number; roas: number; }
export const PNL: PnlRow[] = [
  { name: "Wagyu Festival", b: "teppen", revenue: 952000, budget: 450000, expense: 280000, roi: 3.4, roas: 3.4 },
  { name: "Songkran Teppanyaki", b: "teppen", revenue: 896000, budget: 270000, expense: 320000, roi: 2.8, roas: 2.8 },
  { name: "Father's Day Set", b: "omakase", revenue: 342000, budget: 120000, expense: 95000, roi: 3.6, roas: 3.6 },
  { name: "Cocktail Hour Launch", b: "touka", revenue: 143500, budget: 150000, expense: 35000, roi: 4.1, roas: 4.1 },
  { name: "Golden Week Teaser", b: "teppen", revenue: 220000, budget: 100000, expense: 100000, roi: 2.2, roas: 2.2 },
  { name: "LINE Coupon Drive", b: "mainichi", revenue: 46400, budget: 60000, expense: 58000, roi: 0.8, roas: 0.8 },
];

// Categorized options for the Expense Request dropdown, with per-category budget check.
export interface ExpCategory { key: string; label: string; group: string; budget: number; used: number; }
export const EXP_CATEGORIES: ExpCategory[] = [
  { key: "fb_ig", label: "Facebook / Instagram Ads", group: "Digital Marketing", budget: 550000, used: 380000 },
  { key: "google", label: "Google Ads / PPC", group: "Digital Marketing", budget: 250000, used: 145000 },
  { key: "line_ads", label: "LINE Ads", group: "Digital Marketing", budget: 180000, used: 165000 },
  { key: "kol", label: "KOL / Influencer", group: "Digital Marketing", budget: 280000, used: 193000 },
  { key: "tiktok", label: "TikTok Ads", group: "Digital Marketing", budget: 120000, used: 88000 },
  { key: "photo", label: "Food cost / Photo shoot", group: "Digital Marketing", budget: 90000, used: 65000 },
  { key: "event", label: "Event / Activation", group: "Digital Marketing", budget: 100000, used: 0 },
  { key: "website", label: "Website (Cloud)", group: "System", budget: 80000, used: 80000 },
  { key: "eatlab", label: "Eatlab AI", group: "System", budget: 80000, used: 60000 },
  { key: "salary", label: "Base Salary", group: "Operation", budget: 240000, used: 210000 },
  { key: "agency", label: "Agency Fee", group: "Outsource", budget: 250000, used: 140000 },
  { key: "rent", label: "Office Rent", group: "Administration", budget: 80000, used: 80000 },
];

export const STATUS_TONE: Record<string, Tone> = {
  Paid: "green", Approved: "green", Pending: "gold", Unpaid: "red", "Waiting Approval": "gold", Rejected: "red",
};

export function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export { brandName };
