import { ComingSoon } from "@/components/ui/ComingSoon";

// Locked as a "coming soon" version for the initial team rollout. The full
// Ads Manager implementation is preserved in git history — restore when ready.
export default function AdsManagerPage() {
  return (
    <ComingSoon
      title="Ads Manager"
      note="กำลังจัดเตรียม — จะเปิดใช้งานเร็ว ๆ นี้ ระหว่างนี้งบและงาน Ads ถูกสร้างจาก Campaign Builder อยู่แล้ว"
    />
  );
}
