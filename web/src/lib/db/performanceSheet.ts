import { BrandId } from "@/lib/brands";
import { getAppSetting } from "@/lib/db/appSettings";

export const DEFAULT_PERFORMANCE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1HGu12xge1T2jWx9-bVRPoZl7zB1prz0b5zHzgOeCISk/edit?gid=2134092371#gid=2134092371";

export interface PerformanceSummaryRow {
  brand: string;
  brandId: BrandId | null;
  actualReach: number;
  goalPct: number;
  shareRate: number;
  skipRate: number;
  status: string;
}

export interface PerformanceMonthlyRow {
  brand: string;
  brandId: BrandId | null;
  month: string;
  kpiReach: number;
  actualReach: number;
  kpiShareRate: number;
  actualShareRate: number;
  kpiSkipRate: number;
  actualSkipRate: number;
}

export interface PerformancePostRow {
  id: string;
  source: "Meta" | "TikTok";
  reportDate: string;
  brand: string;
  brandId: BrandId | null;
  account: string;
  title: string;
  publishTime: string;
  link: string;
  type: string;
  views: number;
  reach: number;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  follows: number;
  favorites: number;
  engagement: number;
  shareRate: number;
  skipRate: number;
  fullRate: number;
}

export interface PerformanceSheetPayload {
  sourceUrl: string;
  generatedAt: string;
  summaryRows: PerformanceSummaryRow[];
  monthlyRows: PerformanceMonthlyRow[];
  posts: PerformancePostRow[];
}

export async function fetchPerformanceSheet(): Promise<PerformanceSheetPayload> {
  const saved = await getAppSetting("performance_sheet_url");
  const url = saved?.trim() || DEFAULT_PERFORMANCE_SHEET_URL;
  const res = await fetch(`/api/performance-sheet?url=${encodeURIComponent(url)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new Error(json?.error || "อ่าน Performance sheet ไม่ได้");
  return json as PerformanceSheetPayload;
}
