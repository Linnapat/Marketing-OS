import { ComingSoon } from "@/components/ui/ComingSoon";

// Locked as a "coming soon" version for the initial team rollout. The full
// Request Center implementation is preserved in git history — restore when ready.
export default function RequestCenterPage() {
  return (
    <ComingSoon
      title="Request Center"
      note="กำลังจัดเตรียม — จะเปิดใช้งานเร็ว ๆ นี้ ระหว่างนี้ส่งคำขอเบิกจ่ายได้ที่โมดูล Cashier"
    />
  );
}
