import { BrandFilterValue, BrandId, emptyBrandTotals } from "@/lib/brands";
import { getAppSetting } from "@/lib/db/appSettings";
import { authHeaders } from "@/lib/supabase";

export interface BudgetSheetRow {
  month: string;
  category: string;
  budget: number;
  group?: string;
  brand?: BrandFilterValue;
}

export const currentBudgetMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const currentBudgetYearKey = () => String(new Date().getFullYear());

export async function fetchBudgetSheetRows(): Promise<BudgetSheetRow[]> {
  const url = await getAppSetting("budget_sheet_url");
  if (!url?.trim()) return [];
  const res = await fetch(`/api/budget-sheet?url=${encodeURIComponent(url.trim())}`, { headers: await authHeaders() });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) return [];
  return (json?.rows ?? []) as BudgetSheetRow[];
}

// Accumulators are keyed by the CONFIGURED brands, not a hardcoded four — and each
// add is guarded with `?? 0`, because a sheet row may still name a brand that has
// since been removed from config. Without the guard that read is `undefined` and
// `undefined + n` silently turns the whole budget into NaN.
export function budgetByBrandFromSheet(rows: BudgetSheetRow[], month = currentBudgetMonthKey()): Record<BrandId, number> {
  const totals = emptyBrandTotals();
  for (const row of rows) {
    if (row.month !== month) continue;
    if (!row.brand || row.brand === "all") continue;
    totals[row.brand] = (totals[row.brand] ?? 0) + (row.budget || 0);
  }
  return totals;
}

export function annualBudgetByBrandFromSheet(rows: BudgetSheetRow[], year = currentBudgetYearKey()): Record<BrandId, number> {
  const totals = emptyBrandTotals();
  for (const row of rows) {
    if (!row.month.startsWith(`${year}-`)) continue;
    if (!row.brand || row.brand === "all") continue;
    totals[row.brand] = (totals[row.brand] ?? 0) + (row.budget || 0);
  }
  return totals;
}
