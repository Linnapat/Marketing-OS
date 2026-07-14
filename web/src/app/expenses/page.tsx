"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter, inDateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { PrintableVoucher } from "@/components/finance/PrintableVoucher";
import { ExpenseRequestTab, SpendingLogTab } from "@/components/finance/ExpenseTabs";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { buildCsv, ExpenseRow } from "@/lib/data/finance";
import { baht } from "@/lib/format";
import { fetchExpenses, fetchExpenseRequests, ExpenseReq, ExpenseLogRow } from "@/lib/db/finance";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";

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
  const [requests, setRequests] = useState<ExpenseReq[]>([]);
  const [spending, setSpending] = useState<ExpenseLogRow[]>([]);

  useEffect(() => {
    let alive = true;
    fetchExpenseRequests().then((rows) => { if (alive) setRequests(rows); }).catch(() => {});
    fetchExpenses().then((rows) => { if (alive) setSpending(rows); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const filteredRequests = useMemo(
    () => requests.filter((r) => (brand === "all" || r.b === brand) && inDateFilter(date, r.createdAt)),
    [requests, brand, date],
  );
  const filteredSpending = useMemo(
    () => spending.filter((r) => (brand === "all" || r.b === brand) && inDateFilter(date, r.date)),
    [spending, brand, date],
  );
  const summary = useMemo(() => ({
    requestCount: filteredRequests.length,
    waitingApproval: filteredRequests.filter((r) => r.status === "Waiting Approval").length,
    unpaidTotal: filteredSpending.filter((r) => r.status === "Unpaid").reduce((sum, row) => sum + row.amount + (row.vat || 0), 0),
    spendingTotal: filteredSpending.reduce((sum, row) => sum + row.amount + (row.vat || 0), 0),
  }), [filteredRequests, filteredSpending]);

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
      <CampaignPageHeaderSection
        eyebrow="CASHIER"
        title="Cashier"
        description="Submit expense requests, follow payment status, and export spending in Thai Baht."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={exportCsv} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[12px] px-4 py-[9px] bg-white shadow-soft">
            <Download size={13} /> Export CSV
          </button>}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <BrandFilter value={brand} onChange={setBrand} />
              <Segmented value={tab} onChange={setTab} options={[{ value: "request", label: "Expense Request" }, { value: "log", label: "Spending Log" }]} />
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard
          title="Cashier Summary"
          titleClassName="text-[#6C5CE7]"
          style={{
            background: "#FFFFFF",
            border: "1px solid #ECEAF2",
            boxShadow: "0 16px 40px rgba(108, 92, 231, 0.08)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "Requests in view", value: String(summary.requestCount) },
              { label: "Waiting approval", value: String(summary.waitingApproval) },
              { label: "Unpaid spending", value: baht(summary.unpaidTotal, { compact: true }) },
              { label: "Spend logged", value: baht(summary.spendingTotal, { compact: true }) },
            ].map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2 rounded-pill border px-3 py-[6px] bg-[#F4F0FF]" style={{ borderColor: "#DDD1FF" }}>
                <span className="text-[10.5px] uppercase tracking-[0.06em] text-[#7D72B4] font-extrabold">{item.label}</span>
                <span className="text-[15px] leading-none font-extrabold text-[#2E2755]">{item.value}</span>
              </span>
            ))}
          </div>
        </ModuleSummaryCard>
      </div>

      <div className="mt-5">
        {tab === "request" && <ExpenseRequestTab brand={brand} date={date} />}
        {tab === "log" && <SpendingLogTab brand={brand} date={date} onVoucher={setPvExpense} />}
      </div>

      {pvExpense && <PrintableVoucher expense={pvExpense} onClose={() => setPvExpense(null)} />}
    </>
  );
}
