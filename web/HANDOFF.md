# Marketing OS — Hand-off (2026-07-24)

สรุปสถานะระบบสำหรับ dev คนต่อไป: อะไร deploy แล้ว, อะไรค้างท่อ, ช่องว่างที่รู้อยู่, และวิธีทำงานกับ repo นี้โดยไม่พังของเดิม.

---

## 1. วิธีทำงานกับ repo นี้ (อ่านก่อนแตะโค้ด)

- **มักมีหลาย session/agent ทำงานพร้อมกันในโฟลเดอร์เดียว** → ทำงานใน **git worktree แยกเสมอ**
  (`git worktree add -B <branch> .claude/worktrees/<name> origin/main`). session อื่นเคยสั่ง
  `git reset --hard origin/main` ทับ working tree เดียวกันจน**งานที่ยังไม่ commit หายในไฟล์ที่ git ติดตาม**
  (ไฟล์ใหม่ที่ยัง untracked รอด). commit ให้ไวเพื่อกันโดนล้าง.
- **แอปอยู่ที่ `web/`** (Next.js 14, App Router). dev: `cd web && npm run dev`. อย่ารัน `next build`
  ทับ `next dev` ที่รันอยู่ — CSS จะหาย/ค้าง loading. kill dev ก่อน build.
- **ทดสอบก่อน push เสมอ**: `cd web && npx tsc --noEmit && npm run lint && npm test`.
  ชุดเทสต์เป็น self-contained assert scripts ใน `web/scripts/test-*.ts` (ไม่ต้องมี runner) —
  เพิ่มเทสต์ในไฟล์ที่ตรงหมวด แล้วต่อ command ใน `web/package.json` → `"test"`.
- **โดเมน production ที่ใช้ได้**: `marketing-os-linnapats-projects.vercel.app` และ
  `marketing-os-ivory-seven.vercel.app` (alias ชี้ production ล่าสุดทั้งคู่).
  **ห้ามใช้ทดสอบ**: ลิงก์มี hash เช่น `marketing-xxxxx-…` (เป็น snapshot ของ build เดียว ค้างอยู่กับที่)
  และ `marketing-os.vercel.app` (เป็นของโปรเจกต์คนอื่น ไม่ใช่ของเรา).
- **Supabase**: project id `zxxpyknoymdlhckpchse`. RLS applied แล้ว (ดู §4).
  data blob ของแคมเปญ/คอนเทนต์เก็บใน JSONB คอลัมน์ `data` — อย่า rename field สั้นๆ โดยไม่ migrate.
- **Data flow กลาง**: `saveCampaignBrief()` (`web/src/lib/db/brief.ts`) คือหัวใจ —
  บันทึกบรีฟแล้ว "fan out" เป็น content posts / graphic requests / KOL rows / tasks
  **เฉพาะเมื่อสถานะเป็น Approved/In Progress/Completed** (ก่อนอนุมัติจะเก็บแค่แผน).
  ทุกจุดที่เปลี่ยนสถานะแคมเปญ **ต้องเดินผ่าน pipeline นี้** ไม่ใช่ update คอลัมน์ status ตรงๆ
  (เคยเป็นบั๊ก: dropdown ในหน้า list เขียนแค่ status → log ว่าง, งานไม่ถูกสร้าง).

---

## 2. งานที่ merge + deploy แล้ว (สถานะปัจจุบัน)

**Google Sheet import**: Create Campaign import บรีฟจาก Google Sheet (template + AI prompt ใน
`web/CAMPAIGN_BRIEF_SHEET.md`). อ่านอย่างเดียว, prefill ฟอร์ม, ไม่เขียน DB ตรง. เฉพาะ CMO เห็น.

**RBAC** (ดูรายละเอียด §3–4): สิทธิ์รายบทบาทบังคับใช้แล้วทั้ง UI และ database.

**Creative / KOL**:
- Artwork Count / Creative Summary — แยกงานถ่าย (คิว) กับงานตัด (คลิป), ตารางภาระงานรายคน, revision rate.
- เลขชิ้นงาน (Art#) กำหนดอัตโนมัติจากไซซ์ตอนสร้าง request (ไซซ์เดียวหลาย platform = ชิ้นเดียว).
- Sign-off บรีฟ = เฉพาะสาย Content/Creative (+CMO), requester อนุมัติของตัวเองไม่ได้.

**Platform Performance**:
- KOL เป็น media group แยกของตัวเอง (ไม่ปนใต้ platform โฆษณา) — `platformGroupKey()`.

**Campaign builder / list**:
- Marketing Manager แก้แคมเปญ Approved → เด้งกลับ CMO อนุมัติใหม่ พร้อม diff ว่าแก้อะไร (`briefDiff`).
- เตือนก่อนลบ content ที่ materialize เป็นงานจริงแล้ว.
- ปุ่ม Submit อยู่บนหัวฟอร์ม (ไม่ต้องเลื่อนสุดหน้า).
- Content Plan / KOL จำ filter ต่อ tab (`useStickyView`). Approver = requester (read-only).

---

## 3. PR ที่ยังเปิดค้าง (ต้อง merge)

> main ขยับเร็ว (มี PR จาก agent อื่นด้วย) — ก่อน merge ให้ test-merge; ถ้า conflict ให้ rebase onto origin/main.

| Branch | เนื้อหา | หมายเหตุ |
|---|---|---|
| `fix/kol-actual-name-in-perf` | Performance โชว์ชื่อเพจ KOL จริงเมื่อ assign แล้ว (เดิมค้างชื่อ planner) | ตัวเลขถูกอยู่แล้ว แก้แค่ป้ายชื่อ |
| `fix/perf-column-align` | คอลัมน์ตาราง Platform Performance ตรงกัน (colgroup+fixed) + ชื่อยาวไม่ทับ Budget | 2 commit |
| `feat/rls-brand-scope` | ไฟล์ SQL ของ RLS (migration/rollback/preflight) — **SQL apply กับ DB จริงแล้ว** เหลือ merge ตัวไฟล์เข้า repo เพื่อเก็บประวัติ | ดู §4 |

**ลำดับ merge ที่ปลอดภัย**: `fix/kol-actual-name-in-perf` → `fix/perf-column-align` (ทั้งคู่แตะ
`platforms/page.tsx` + `campaignResult.ts`), `feat/rls-brand-scope` อิสระ. ถ้า main ขยับจนชน — rebase ก่อน.

---

## 4. RBAC — กติกาและการบังคับใช้ (สำคัญที่สุด)

กติกาเต็มอยู่ใน commit history + auto-memory. สรุป:

**บังคับที่ระดับ database แล้ว** (`web/supabase/security_p9_brand_scope.sql`, apply + probe 8/8 PASS เมื่อ 18 ก.ค.):
- `brand_visible()` gate ทุกคำสั่งอ่าน/เขียนบน campaigns / graphic_requests / content_posts /
  requests / expenses / campaign_results. **fail-closed** เมื่อ scope อ่านไม่ออก (ต่างจาก client ที่ fail-open โดยตั้งใจ).
- trigger `campaigns_status_guard` — เข้าสถานะ Approved/In Progress/Completed = CMO เท่านั้น
  (เว้นขาถอยไป "Waiting for Approval" ให้ staff เพื่อ flow แก้-ส่งอนุมัติใหม่).
- **rollback**: `web/supabase/security_p9_rollback.sql` (คืน staff_rw เดิมครบในคำสั่งเดียว).
- **gotcha ตอนเทสต์ RLS**: `members_guard` บล็อกการแก้ `brand_access` แม้รันเป็น postgres —
  ต้อง `set_config('request.jwt.claims', …admin…)` ก่อน. เทสต์แบบสวม role จริงใน temp transaction
  แล้วคืนค่าท้าย script (ตัวอย่างเต็มใน git log ของ security_p9).

**บังคับที่ระดับ UI** (ยังไม่มี RLS — งานเฟส 3):
- สร้างแคมเปญ = ตาม Settings → Permissions matrix (Campaign ≥ Edit). อ่าน matrix จริงผ่าน
  `lib/roleGates.ts` + `lib/usePermGates.ts` — **แก้สิทธิ์ใน Settings มีผลทันทีไม่ต้องแก้โค้ด**.
- Edit แคมเปญ = CMO + Marketing Manager/BGL.
- Platform Performance = สายวางแผน/บริหารเท่านั้น (KOL + Creative ปิด).
- Import Google Sheet = CMO เท่านั้น.

**บัญชี QA ทดสอบ RBAC**: `Marketing-crm@teppenthailand.co.th` (สลับ role ใน Settings เพื่อทดสอบ).

---

## 5. ช่องว่าง / งานค้าง (backlog)

**ต้องทำก่อน/หลัง go-live ใกล้ๆ**:
- **เชิญพนักงานที่ยัง login ไม่ได้** — แถวใน `members` อย่างเดียว login ไม่ได้ (ปิด signup).
  ต้องส่งคำเชิญผ่าน `/api/members/invite` (ปุ่มใน Settings) — ต้องมี `SUPABASE_SERVICE_ROLE_KEY` บน Vercel.
  mailer ในตัว Supabase จำกัด ~3-4 ฉบับ/ชม. → ทยอยเชิญ หรือสร้างใน Supabase Dashboard (Auto Confirm) โดยตรง.
- **Custom SMTP** — ก่อนต้องเชิญคน/แจ้งเตือนเยอะๆ (เพดาน mailer จะเป็นคอขวด).

**เฟส 3 (RLS เพิ่ม)**:
- enforce Settings → Permissions matrix **รายโมดูล** ที่ระดับ database (ตอนนี้ campaign-create เป็น UI เท่านั้น;
  brand-scope + campaign-status ทำ RLS แล้ว). โครง `roleGates` พร้อมต่อยอด.

**ฟีเจอร์ที่ขอไว้ ยังไม่ทำ**:
- **POS setting request → เขียนลง Google Sheet**: ต้องใช้ Google Sheets API แบบ *เขียน*
  (service account + สิทธิ์เขียน sheet) — คนละกลไกกับ import ที่อ่านอย่างเดียว. ยังไม่ได้ระบุ sheet ปลายทาง/คอลัมน์.
- **แยกวันออกกอง vs วันส่งไฟล์** ของงานถ่าย (ตอนนี้มี due เดียว).
- **AI features** (caption generator, campaign idea helper) — รอ `ANTHROPIC_API_KEY` ใน env.
- **สมาชิก Agency (External)** สำหรับทดสอบ portal — ยังไม่ได้สร้างบัญชีทดสอบแยก.

**หนี้ทางเทคนิคที่ควรรู้**:
- Grand Menu Roundup ที่ "ลบแล้วยังค้าง" ในตัวอย่างเก่า — เคสใหม่มี guard เตือนแล้ว แต่แถวเก่าที่ค้าง
  ต้องลบมือใน Content Plan/Creative Kitchen (materialize ไปแล้วไม่ cascade ลบ โดยตั้งใจ).
- Demo mode (ไม่มี Supabase env) ใช้ mock seed — บางหน้า (เช่น Platform Performance) seed ไม่ตรงเดือน
  ปัจจุบัน ทำให้ทดสอบ UI ในเครื่องยาก. ทดสอบ logic ผ่าน unit test, ทดสอบ UI บน production ที่มีข้อมูลจริง.

---

## 6. ไฟล์เอกสารอื่นในรีโปที่ควรอ่าน

- `web/CAMPAIGN_BRIEF_SHEET.md` — template + AI prompt ของ Google Sheet import.
- `web/AUTH.md`, `web/SUPABASE.md`, `web/PRODUCTION_HARDENING.md` — auth model, DB setup, hardening.
- `web/KOL_MASTER.md`, `web/NOTIFICATIONS.md` — KOL library, LINE/email notify.
- `web/supabase/*.sql` — migrations เรียงตาม `security_p1..p9` (p9 = brand-scope RLS ล่าสุด).
