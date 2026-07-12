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
  FilterBar,
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
  const graphMax = Math.max(summary.requestCount, summary.waitingApproval, summary.unpaidTotal, summary.spendingTotal, 1);

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
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-faint">
                One place for request intake, vouchers, and spending follow-up
              </div>
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
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {[
                { label: "Requests in view", value: summary.requestCount, note: "Current brand + date filters" },
                { label: "Waiting approval", value: summary.waitingApproval, note: "Needs approver action" },
                { label: "Unpaid spending", value: baht(summary.unpaidTotal), note: "Approved but not marked paid" },
                { label: "Spend logged", value: baht(summary.spendingTotal), note: "Actual spending in the log" },
              ].map((item) => (
                <div key={item.label} className="rounded-[20px] border px-4 py-4 bg-[#F4F0FF]" style={{ borderColor: "#DDD1FF" }}>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-[#7D72B4] font-extrabold">{item.label}</div>
                  <div className="mt-3 text-[28px] leading-none font-extrabold text-[#2E2755]">{item.value}</div>
                  <div className="mt-2 text-[11px] text-[#7D778F]">{item.note}</div>
                </div>
              ))}
            </div>
            <div className="rounded-[20px] border px-4 py-4 bg-[#F8F5FF]" style={{ borderColor: "#E4DAFF" }}>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#7D72B4] font-extrabold mb-4">Cash flow glance 📊</div>
              <div className="flex flex-col gap-4">
                {[
                  { label: "Requests", value: summary.requestCount, display: String(summary.requestCount), color: "#8B7BFF" },
                  { label: "Waiting", value: summary.waitingApproval, display: String(summary.waitingApproval), color: "#B59CFF" },
                  { label: "Unpaid", value: summary.unpaidTotal, display: baht(summary.unpaidTotal, { compact: true }), color: "#C5B2FF" },
                  { label: "Logged", value: summary.spendingTotal, display: baht(summary.spendingTotal, { compact: true }), color: "#6C5CE7" },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[12px] font-bold text-[#4A4373]">{item.label}</span>
                      <span className="text-[12px] font-extrabold" style={{ color: item.color }}>{item.display}</span>
                    </div>
                    <div className="h-[10px] rounded-full bg-white overflow-hidden border border-[#E4DAFF]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(8, Math.round((item.value / graphMax) * 100))}%`, background: item.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ModuleSummaryCard>

        <FilterBar>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <BrandFilter value={brand} onChange={setBrand} />
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-pill bg-[#F2EEFF] px-3 py-[7px] font-bold text-[#6C5CE7]">Voucher preview included</span>
              <span className="rounded-pill bg-[#EAF8EE] px-3 py-[7px] font-bold text-[#4BA06B]">Requester signature ready</span>
              <span className="rounded-pill bg-[#FFF6E8] px-3 py-[7px] font-bold text-[#C68A1E]">Approval flow unchanged</span>
            </div>
          </div>
        </FilterBar>
      </div>

      <div className="mt-5">
        {tab === "request" && <ExpenseRequestTab brand={brand} date={date} />}
        {tab === "log" && <SpendingLogTab brand={brand} date={date} onVoucher={setPvExpense} />}
      </div>

      {pvExpense && <PrintableVoucher expense={pvExpense} onClose={() => setPvExpense(null)} />}
    </>
  );
}
