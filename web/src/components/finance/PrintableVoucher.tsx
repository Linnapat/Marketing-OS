"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { bahtText, thb } from "@/lib/bahtText";
import { ExpenseRow } from "@/lib/data/finance";
import { brandName } from "@/lib/brands";
import { getSavedSignature } from "@/lib/signature";

/**
 * ใบสำคัญจ่ายทั่วไป — printable A5 landscape voucher, ported from Payment Voucher.dc.html.
 * Full-screen overlay with a Payment / Petty Cash toggle and native print.
 */
export function PrintableVoucher({ expense, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  // Header follows the reimbursement type chosen on the expense request; the
  // toggle stays as a manual override (older rows have no stored type → Payment).
  const [type, setType] = useState<"PAYMENT" | "PETTY">(
    expense.reimburseType === "Petty Cash" ? "PETTY" : "PAYMENT",
  );
  const isPV = type === "PAYMENT";
  // Remembered signatures flow straight into the voucher for print.
  const [preparerSig, setPreparerSig] = useState<string | null>(null);
  const [approverSig, setApproverSig] = useState<string | null>(null);
  useEffect(() => {
    setPreparerSig(getSavedSignature("preparer"));
    setApproverSig(getSavedSignature("approver"));
  }, []);

  const amount = expense.amount;
  const items = [
    { desc: expense.category, dept: "การตลาด", amount },
    { desc: "", dept: "", amount: null as number | null },
    { desc: "", dept: "", amount: null as number | null },
    { desc: "", dept: "", amount: null as number | null },
  ];
  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  // Actual VAT / WHT amounts from the request (0 when the requester didn't
  // tick them) — not a blanket 7% / 3% on every voucher.
  const wht = Number(expense.wht ?? 0);
  const vat = Number(expense.vat ?? 0);
  const total = subtotal - wht + vat;

  const pvNo = `PV-2569-${String(Math.floor(1000 + (amount % 9000))).padStart(5, "0")}`;
  const voucherBg = isPV ? "#4472c4" : "#c0392b";
  const cell = "1px solid #888";
  const cellLight = "1px solid #ccc";

  return (
    <div className="fixed inset-0 z-[100] overflow-auto" style={{ background: "#5b6472", fontFamily: "\"Sarabun\", \"Noto Sans Thai\", system-ui, sans-serif" }}>
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 px-5 py-[9px]" style={{ background: "#1a3a6b", boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
        <span className="text-white text-[14px] font-semibold">ใบสำคัญจ่ายทั่วไป · Preview</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setType("PAYMENT")} className="px-[14px] py-[5px] rounded text-[12px] font-bold" style={{ border: "2px solid #4472c4", background: isPV ? "#4472c4" : "transparent", color: "#fff" }}>PAYMENT VOUCHER</button>
          <button onClick={() => setType("PETTY")} className="px-[14px] py-[5px] rounded text-[12px] font-bold" style={{ border: "2px solid #c0392b", background: isPV ? "transparent" : "#c0392b", color: "#fff" }}>PETTY CASH VOUCHER</button>
          <div style={{ width: 1, height: 22, background: "rgba(255,255,255,.3)", margin: "0 4px" }} />
          <button onClick={() => window.print()} className="px-[18px] py-[5px] rounded text-[12px] text-white" style={{ border: "1.5px solid rgba(255,255,255,.8)", background: "transparent" }}>🖨 พิมพ์</button>
          <button onClick={onClose} className="px-[14px] py-[5px] rounded text-[12px] text-white" style={{ border: "1.5px solid rgba(255,255,255,.5)", background: "transparent" }}>✕ ปิด</button>
        </div>
      </div>

      {/* A5 document */}
      <div className="flex justify-center py-6 px-4">
        <div className="print-root bg-white" style={{ width: "210mm", minHeight: "148mm", padding: "8mm", boxShadow: "0 4px 24px rgba(0,0,0,.3)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, color: "#111", tableLayout: "fixed", lineHeight: 1.35 }}>
            <tbody>
              <tr>
                {/* Company logo */}
                <td rowSpan={5} style={{ border: cell, textAlign: "center", verticalAlign: "middle", padding: 4, width: "18%" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 110 }}>
                    <Image
                      src="/teppen-logo.png"
                      alt="TEPPEN Food entertainment"
                      width={150}
                      height={150}
                      style={{ width: "88%", height: "auto", objectFit: "contain" }}
                      priority
                    />
                  </div>
                </td>
                <td colSpan={3} style={{ border: cell, textAlign: "center", padding: "2px 6px", fontWeight: 700, fontSize: 11, color: "#1a3a6b" }}>14/2 ซอยสุขุมวิท 61 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110</td>
                <td style={{ border: cell, textAlign: "right", padding: "2px 5px", fontSize: 9.5, color: "#555", verticalAlign: "top" }}>(สำนักงานใหญ่)</td>
              </tr>
              <tr><td colSpan={4} style={{ border: cell, textAlign: "center", padding: "2px 6px", fontWeight: 700, fontSize: 11, color: "#E22828" }}>ใบสำคัญจ่ายทั่วไป</td></tr>
              <tr><td colSpan={4} style={{ border: cell, background: voucherBg, textAlign: "center", padding: "4px 6px", fontWeight: 700, fontSize: 12, color: "white", letterSpacing: 1 }}>{isPV ? "PAYMENT VOUCHER" : "PETTY CASH VOUCHER"}</td></tr>
              <tr><td colSpan={3} style={{ border: cell, padding: "2px 6px", textAlign: "right", fontSize: 9.5, color: "#555", fontWeight: 600 }}>PV NO.</td><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>{pvNo}</td></tr>
              <tr><td colSpan={3} style={{ border: cell, padding: "2px 6px", textAlign: "right", fontSize: 9.5, color: "#555", fontWeight: 600 }}>วันที่</td><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>{expense.date} 2569</td></tr>

              <tr><td style={{ border: cell, padding: "3px 6px", fontWeight: 600, fontSize: 10, whiteSpace: "nowrap" }}>จ่ายให้ (Pay To) :</td><td colSpan={4} style={{ border: cell, padding: "3px 8px", fontSize: 10 }}>{expense.vendor}</td></tr>
              <tr><td style={{ border: cell, padding: "3px 6px", fontWeight: 600, fontSize: 10, whiteSpace: "nowrap", verticalAlign: "top" }}>ที่อยู่ (Add) :</td><td colSpan={4} style={{ border: cell, padding: "3px 8px", height: 24, fontSize: 10, verticalAlign: "top" }} /></tr>

              <tr>
                <td colSpan={3} style={{ border: cell, background: "#dde8f3", textAlign: "center", padding: "3px 6px", fontWeight: 700, fontSize: 10 }}>รายการ (Description)</td>
                <td style={{ border: cell, background: "#dde8f3", textAlign: "center", padding: "3px 4px", fontWeight: 700, fontSize: 10 }}>หน่วยงานที่ใช้</td>
                <td style={{ border: cell, background: "#dde8f3", textAlign: "center", padding: "3px 4px", fontWeight: 700, fontSize: 10 }}>จำนวนเงิน (Amount)</td>
              </tr>
              {items.map((it, i) => (
                <tr key={i}>
                  <td colSpan={3} style={{ border: cellLight, padding: "2px 6px", height: 19, fontSize: 10 }}>{it.desc}</td>
                  <td style={{ border: cellLight, padding: "2px 4px", textAlign: "center", fontSize: 10 }}>{it.dept}</td>
                  <td style={{ border: cellLight, padding: "2px 6px", textAlign: "right", fontSize: 10 }}>{thb(it.amount)}</td>
                </tr>
              ))}

              <tr><td style={{ border: cell, padding: "2px 6px", fontWeight: 600, fontSize: 10 }}>Brand</td><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>{brandName(expense.b)}</td><td style={{ border: cell }} /><td style={{ border: cell }} /><td style={{ border: cell }} /></tr>
              <tr><td style={{ border: cell, padding: "2px 6px", fontWeight: 600, fontSize: 10 }}>Branch</td><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>สำนักงานใหญ่</td><td style={{ border: cell }} /><td style={{ border: cell }} /><td style={{ border: cell }} /></tr>

              <tr><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>ภาษี ณ ที่จ่าย</td><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>{wht > 0 ? "3 %" : "—"}</td><td style={{ border: cell }} /><td style={{ border: cell }} /><td style={{ border: cell, padding: "2px 6px", textAlign: "right", fontSize: 10 }}>{wht > 0 ? thb(wht) : ""}</td></tr>
              <tr><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>ภาษี</td><td style={{ border: cell, padding: "2px 6px", fontSize: 10 }}>{vat > 0 ? "7 %" : "—"}</td><td style={{ border: cell }} /><td style={{ border: cell }} /><td style={{ border: cell, padding: "2px 6px", textAlign: "right", fontSize: 10 }}>{vat > 0 ? thb(vat) : ""}</td></tr>

              <tr>
                <td style={{ border: cell, padding: "3px 6px", fontWeight: 700, fontSize: 10, background: "#eef4ea" }}>รวม (ตัวอักษร)</td>
                <td colSpan={2} style={{ border: cell, padding: "3px 6px", fontSize: 10, background: "#eef4ea" }}>{bahtText(total)}</td>
                <td style={{ border: cell, padding: "3px 5px", textAlign: "center", fontWeight: 600, fontSize: 10, background: "#eef4ea" }}>จำนวนเงิน</td>
                <td style={{ border: cell, padding: "3px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, background: "#eef4ea" }}>{thb(total)}</td>
              </tr>
            </tbody>
          </table>

          {/* Footer */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginTop: -1, tableLayout: "fixed" }}>
            <tbody>
              <tr>
                <td rowSpan={4} style={{ border: cell, padding: "5px 10px", verticalAlign: "top", fontSize: 10, lineHeight: 1.85 }}>
                  <div>เอกสารประกอบ .......................................................................</div>
                  <div>เลขที่ใบสั่งซื้อ .......................................................................</div>
                  <div>หนังสือรับรองหัก ณ ที่จ่าย ................................... ฉบับ</div>
                  <div>อื่น ๆ .......................................................................</div>
                </td>
                <td style={{ border: cell, padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: 10, background: "#e4edf7" }}>ผู้จัดทำ / วันที่</td>
                <td style={{ border: cell, padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: 10, background: "#e4edf7" }}>ผู้อนุมัติ / วันที่</td>
              </tr>
              <tr>
                <td style={{ border: cell, height: 34, textAlign: "center", verticalAlign: "middle", padding: 2 }}>
                  {preparerSig && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preparerSig} alt="ผู้จัดทำ" style={{ maxHeight: 30, maxWidth: "85%", margin: "0 auto", display: "block" }} />
                      <div style={{ fontSize: 8.5, color: "#555" }}>{expense.date} 2569</div>
                    </>
                  )}
                </td>
                <td style={{ border: cell, height: 34, textAlign: "center", verticalAlign: "middle", padding: 2 }}>
                  {approverSig && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={approverSig} alt="ผู้อนุมัติ" style={{ maxHeight: 30, maxWidth: "85%", margin: "0 auto", display: "block" }} />
                      <div style={{ fontSize: 8.5, color: "#555" }}>{expense.date} 2569</div>
                    </>
                  )}
                </td>
              </tr>
              <tr><td style={{ border: cell, padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: 10, background: "#e4edf7" }}>ผู้จ่ายเงิน / วันที่</td><td style={{ border: cell, background: "#fafafa" }} /></tr>
              <tr><td style={{ border: cell, height: 30 }} /><td style={{ border: cell, background: "#fafafa" }} /></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
