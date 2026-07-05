"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { PrintableVoucher } from "@/components/finance/PrintableVoucher";
import { ExpenseRequestTab, SpendingLogTab } from "@/components/finance/ExpenseTabs";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { EXPENSES, REQUESTS, buildCsv, ExpenseRow } from "@/lib/data/finance";

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExpensesPage() {
  const [tab, setTab] = useState<"request" | "log">("request");
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [pvExpense, setPvExpense] = useState<ExpenseRow | null>(null);

  const exportCsv = () => {
    if (tab === "log") {
      download("spending-log.csv", buildCsv(
        ["Vendor", "Category", "Brand", "Amount", "VAT", "Date", "Status"],
        EXPENSES.filter((e) => brand === "all" || e.b === brand).map((e) => [e.vendor, e.category, brandName(e.b), e.amount, e.vat, e.date, e.status]),
      ));
    } else {
      download("expense-requests.csv", buildCsv(
        ["Category", "Brand", "Campaign", "Requested", "Approved", "Due", "Status"],
        REQUESTS.filter((r) => brand === "all" || r.b === brand).map((r) => [r.category, brandName(r.b), r.campaign, r.requested, r.approved, r.due, r.status]),
      ));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Expenses"
        title="Expenses"
        subtitle="Submit expense requests and track spending — in Thai Baht."
      />

      <div className="mt-[14px]">
        <DateFilterBar value={date} onChange={setDate} />
      </div>
      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <BrandFilter value={brand} onChange={setBrand} />
        <button onClick={exportCsv} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white">
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div className="mt-5">
        <Segmented value={tab} onChange={setTab} options={[{ value: "request", label: "Expense Request" }, { value: "log", label: "Spending Log" }]} />
      </div>

      <div className="mt-5">
        {tab === "request" && <ExpenseRequestTab brand={brand} />}
        {tab === "log" && <SpendingLogTab brand={brand} onVoucher={setPvExpense} />}
      </div>

      {pvExpense && <PrintableVoucher expense={pvExpense} onClose={() => setPvExpense(null)} />}
    </>
  );
}
