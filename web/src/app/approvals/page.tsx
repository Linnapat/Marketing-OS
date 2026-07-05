import { ComingSoon } from "@/components/ui/ComingSoon";

// Locked as a "coming soon" version for the initial team rollout. The full
// Approval Queue implementation is preserved in git history — restore when ready.
export default function ApprovalQueuePage() {
  return (
    <ComingSoon
      title="Approval Queue"
      note="กำลังจัดเตรียม — จะเปิดใช้งานเร็ว ๆ นี้ ระหว่างนี้อนุมัติงบ/ค่าใช้จ่ายได้ที่ Finance › Approval"
    />
  );
}
