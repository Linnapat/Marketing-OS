import { NextRequest, NextResponse } from "next/server";
import { spreadsheetId, csvUrl, parseCsv } from "@/lib/googleSheet";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1HGu12xge1T2jWx9-bVRPoZl7zB1prz0b5zHzgOeCISk/edit?gid=2134092371#gid=2134092371";
const GIDS = {
  summary: "1803516949",
  meta: "2134092371",
  tiktok: "1722299042",
};

async function fetchGrid(id: string, gid: string): Promise<string[][]> {
  const res = await fetch(csvUrl(id, gid), { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error("PRIVATE_SHEET");
  return parseCsv(text);
}

const clean = (value: string | undefined) => (value ?? "").replace(/\u00a0/g, " ").trim();
const number = (value: string | undefined) => Number(clean(value).replace(/[^\d.-]/g, "")) || 0;
const percent = (value: string | undefined) => {
  const raw = clean(value);
  if (!raw) return 0;
  return Number(raw.replace("%", "").replace(/[^\d.-]/g, "")) || 0;
};

function brandId(value: string): "teppen" | "omakase" | "mainichi" | "touka" | null {
  const key = clean(value).toLowerCase();
  if (/teppen/.test(key)) return "teppen";
  if (/omd|omakase/.test(key)) return "omakase";
  if (/mainichi/.test(key)) return "mainichi";
  if (/touka|takao/.test(key)) return "touka";
  return null;
}

function parseSummary(grid: string[][]) {
  const summaryRows: {
    brand: string;
    brandId: string | null;
    actualReach: number;
    goalPct: number;
    shareRate: number;
    skipRate: number;
    status: string;
  }[] = [];
  const monthlyRows: {
    brand: string;
    brandId: string | null;
    month: string;
    kpiReach: number;
    actualReach: number;
    kpiShareRate: number;
    actualShareRate: number;
    kpiSkipRate: number;
    actualSkipRate: number;
  }[] = [];

  const summaryHeaderIndex = grid.findIndex((r) => clean(r[0]) === "Brand" && clean(r[1]) === "Actual Reach");
  if (summaryHeaderIndex >= 0) {
    for (const r of grid.slice(summaryHeaderIndex + 1)) {
      const brand = clean(r[0]);
      if (!brand) break;
      summaryRows.push({
        brand,
        brandId: brandId(brand),
        actualReach: number(r[1]),
        goalPct: percent(r[2]),
        shareRate: percent(r[3]),
        skipRate: percent(r[4]),
        status: clean(r[5]) || "—",
      });
    }
  }

  for (let i = 0; i < grid.length; i++) {
    const possibleBrand = clean(grid[i]?.[0]);
    const next = grid[i + 1] ?? [];
    if (!possibleBrand || clean(next[0]) !== "Month" || clean(next[1]) !== "KPI Reach") continue;
    for (const r of grid.slice(i + 2)) {
      const month = clean(r[0]);
      if (!/^\d{1,2}$/.test(month)) break;
      monthlyRows.push({
        brand: possibleBrand,
        brandId: brandId(possibleBrand),
        month: month.padStart(2, "0"),
        kpiReach: number(r[1]),
        actualReach: number(r[2]),
        kpiShareRate: percent(r[3]),
        actualShareRate: percent(r[4]),
        kpiSkipRate: percent(r[5]),
        actualSkipRate: percent(r[6]),
      });
    }
  }

  return { summaryRows, monthlyRows };
}

function parseMeta(grid: string[][]) {
  const header = (grid[0] ?? []).map((h) => clean(h).toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const i = {
    reportDate: col("report date"),
    brand: col("brand"),
    account: col("account name"),
    description: col("description"),
    publishTime: col("publish time"),
    permalink: col("permalink"),
    type: col("post type"),
    views: col("views"),
    reach: col("reach"),
    likes: col("likes"),
    shares: col("shares"),
    follows: col("follows"),
    comments: col("comments"),
    saves: col("saves"),
    skipRate: col("skip rate (%)"),
  };
  return grid.slice(1).map((r, idx) => {
    const reach = number(r[i.reach]);
    const shares = number(r[i.shares]);
    const likes = number(r[i.likes]);
    const comments = number(r[i.comments]);
    const saves = number(r[i.saves]);
    const follows = number(r[i.follows]);
    const brand = clean(r[i.brand]);
    return {
      id: `meta-${idx}`,
      source: "Meta" as const,
      reportDate: clean(r[i.reportDate]),
      brand,
      brandId: brandId(brand),
      account: clean(r[i.account]),
      title: clean(r[i.description]).slice(0, 120),
      publishTime: clean(r[i.publishTime]),
      link: clean(r[i.permalink]),
      type: clean(r[i.type]),
      views: number(r[i.views]),
      reach,
      likes,
      shares,
      comments,
      saves,
      follows,
      favorites: 0,
      engagement: likes + shares + comments + saves,
      shareRate: reach > 0 ? (shares / reach) * 100 : 0,
      skipRate: percent(r[i.skipRate]),
      fullRate: 0,
    };
  }).filter((r) => r.brand && (r.views || r.reach || r.link));
}

function parseTikTok(grid: string[][]) {
  const header = (grid[0] ?? []).map((h) => clean(h).toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const i = {
    reportDate: col("report date"),
    brand: col("brand"),
    title: col("video title"),
    link: col("video link"),
    publishTime: col("post time"),
    views: col("video views"),
    likes: col("likes"),
    comments: col("comments"),
    shares: col("shares"),
    favorites: col("add to favorites"),
    skipRate: col("skip rate (%)"),
    fullRate: col("full rate (%)"),
  };
  return grid.slice(1).map((r, idx) => {
    const views = number(r[i.views]);
    const shares = number(r[i.shares]);
    const likes = number(r[i.likes]);
    const comments = number(r[i.comments]);
    const favorites = number(r[i.favorites]);
    const brand = clean(r[i.brand]);
    return {
      id: `tiktok-${idx}`,
      source: "TikTok" as const,
      reportDate: clean(r[i.reportDate]),
      brand,
      brandId: brandId(brand),
      account: "TikTok",
      title: clean(r[i.title]).slice(0, 120),
      publishTime: clean(r[i.publishTime]),
      link: clean(r[i.link]),
      type: "TikTok video",
      views,
      reach: views,
      likes,
      shares,
      comments,
      saves: 0,
      follows: 0,
      favorites,
      engagement: likes + shares + comments + favorites,
      shareRate: views > 0 ? (shares / views) * 100 : 0,
      skipRate: percent(r[i.skipRate]),
      fullRate: percent(r[i.fullRate]),
    };
  }).filter((r) => r.brand && (r.views || r.link));
}

export async function GET(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const sourceUrl = req.nextUrl.searchParams.get("url")?.trim() || DEFAULT_SHEET_URL;
  const id = spreadsheetId(sourceUrl);
  if (!id) return NextResponse.json({ error: "Invalid Google Sheets URL" }, { status: 400 });

  try {
    const [summaryGrid, metaGrid, tiktokGrid] = await Promise.all([
      fetchGrid(id, GIDS.summary),
      fetchGrid(id, GIDS.meta),
      fetchGrid(id, GIDS.tiktok),
    ]);
    const { summaryRows, monthlyRows } = parseSummary(summaryGrid);
    const metaPosts = parseMeta(metaGrid);
    const tiktokPosts = parseTikTok(tiktokGrid);
    return NextResponse.json({
      sourceUrl,
      generatedAt: new Date().toISOString(),
      summaryRows,
      monthlyRows,
      posts: [...metaPosts, ...tiktokPosts],
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "PRIVATE_SHEET"
      ? 'sheet ยังไม่เปิดแชร์ — ตั้ง Share เป็น "Anyone with the link · Viewer" ก่อน'
      : `อ่าน Performance sheet ไม่ได้${error instanceof Error ? ` (${error.message})` : ""}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
