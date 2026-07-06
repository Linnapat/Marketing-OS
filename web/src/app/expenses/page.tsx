"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter, inDateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { PrintableVoucher } from "@/components/finance/PrintableVoucher";
import { ExpenseRequestTab, SpendingLogTab } from "@/components/finance/ExpenseTabs";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { buildCsv, ExpenseRow } from "@/lib/data/finance";
import { fetchExpenses, fetchExpenseRequests } from "@/lib/db/finance";

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

  // Export what the page actually shows: real DB rows, current brand + period.
  const exportCsv = async () => {
    if (tab === "log") {
      const all = await fetchExpenses();
      download("spending-log.csv", buildCsv(
        ["Vendor", "Category", "Brand", "Amount", "VAT", "Date", "Status"],
        all.filter((e) => (brand === "all" || e.b === brand) && inDateFilter(date, e.date))
          .map((e) => [e.vendor, e.category, brandName(e.b), e.amount, e.vat, e.date, e.status]),
      ));
    } else {
      const all = await fetchExpenseRequests();
      download("expense-requests.csv", buildCsv(
        ["Ref", "Category", "Brand", "Campaign", "Requester", "Vendor", "Requested", "Approved", "Status", "Created"],
        all.filter((r) => (brand === "all" || r.b === brand) && inDateFilter(date, r.createdAt))
          .map((r) => [r.ref ?? "", r.category, brandName(r.b), r.campaign, r.requester ?? "", r.vendor ?? "", r.requested, r.approved, r.status, r.createdAt?.slice(0, 10) ?? ""]),
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
        {tab === "request" && <ExpenseRequestTab brand={brand} date={date} />}
        {tab === "log" && <SpendingLogTab brand={brand} date={date} onVoucher={setPvExpense} />}
      </div>

      {pvExpense && <PrintableVoucher expense={pvExpense} onClose={() => setPvExpense(null)} />}
    </>
  );
}
