import { BrandFilterValue, BrandId } from "@/lib/brands";
import { getAppSetting } from "@/lib/db/appSettings";

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

export async function fetchBudgetSheetRows(): Promise<BudgetSheetRow[]> {
  const url = await getAppSetting("budget_sheet_url");
  if (!url?.trim()) return [];
  const res = await fetch(`/api/budget-sheet?url=${encodeURIComponent(url.trim())}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) return [];
  return (json?.rows ?? []) as BudgetSheetRow[];
}

export function budgetByBrandFromSheet(rows: BudgetSheetRow[], month = currentBudgetMonthKey()): Record<BrandId, number> {
  const totals: Record<BrandId, number> = { teppen: 0, omakase: 0, mainichi: 0, touka: 0 };
  for (const row of rows) {
    if (row.month !== month) continue;
    if (!row.brand || row.brand === "all") continue;
    totals[row.brand] += row.budget || 0;
  }
  return totals;
}
