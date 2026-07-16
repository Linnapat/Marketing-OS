import Link from "next/link";

// Branded 404 to replace Next.js's bare default (audit P3-7).
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ivory p-4">
      <div className="bg-surface border border-line rounded-cardLg p-10 max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-[10px] bg-accent flex items-center justify-center text-panel font-extrabold text-[16px]">M</div>
          <div className="text-[16px] font-extrabold leading-none">Marketing OS</div>
        </div>
        <div className="text-[40px] font-extrabold text-ink leading-none mb-2">404</div>
        <div className="text-[15px] font-extrabold text-ink mb-1">ไม่พบหน้าที่คุณกำลังหา</div>
        <div className="text-[13px] text-muted leading-[1.6] mb-6">
          ลิงก์อาจผิด ถูกย้าย หรือหน้านี้ถูกลบไปแล้ว — กลับไปที่หน้าแรกเพื่อเริ่มใหม่
        </div>
        <Link
          href="/"
          className="inline-block text-[13px] font-bold text-white bg-accent rounded-[10px] px-5 py-[10px] hover:opacity-90 transition"
        >
          ← กลับหน้าแรก
        </Link>
      </div>
    </div>
  );
}
