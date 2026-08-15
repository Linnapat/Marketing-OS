# คู่มือใช้งาน Marketing-OS — ตั้งแต่เปิดแคมเปญจนปิดงาน

ฉบับ 1 ส.ค. 2569 · อ้างอิงโค้ด `origin/main @ bd0c3c8` + permission matrix จริงบน production

> ทุกกฎในคู่มือนี้ถอดมาจากโค้ดและ database จริง ไม่ใช่ของที่ควรจะเป็น
> จุดไหนที่ระบบ **บังคับที่ database** (แหกไม่ได้แม้ยิง API ตรง) จะมีเครื่องหมาย 🔒
> จุดไหนที่ **กั้นแค่หน้าจอ** (ซ่อนปุ่ม) จะมีเครื่องหมาย 👁 — คนที่รู้วิธียิง API ยังทำได้

---

## สารบัญ

1. [บทบาทในระบบ และใครเห็นเมนูอะไร](#1-บทบาทในระบบ)
2. [Permission Matrix — ตารางสิทธิ์รายโมดูล](#2-permission-matrix)
3. [ภาพรวม Flow ทั้งเส้น](#3-ภาพรวม-flow-ทั้งเส้น)
4. [ขั้นที่ 1 — เปิดแคมเปญ (Campaign Builder)](#ขั้นที่-1--เปิดแคมเปญ)
5. [ขั้นที่ 2 — CMO อนุมัติแคมเปญ](#ขั้นที่-2--cmo-อนุมัติแคมเปญ)
6. [ขั้นที่ 3 — Content Plan + Caption](#ขั้นที่-3--content-plan--caption)
7. [ขั้นที่ 4 — Graphic Request (บรีฟงานออกแบบ)](#ขั้นที่-4--graphic-request)
8. [ขั้นที่ 5 — ตรวจงาน 2 ด่าน (ข้อมูล + Visual CI)](#ขั้นที่-5--ตรวจงาน-2-ด่าน)
9. [ขั้นที่ 6 — KOL](#ขั้นที่-6--kol)
10. [ขั้นที่ 7 — เบิกเงิน / จ่ายเงิน](#ขั้นที่-7--เบิกเงิน--จ่ายเงิน)
11. [ขั้นที่ 8 — ปิดแคมเปญ + วัดผล](#ขั้นที่-8--ปิดแคมเปญ--วัดผล)
12. [ตารางสรุป: ใคร Approve อะไรได้บ้าง](#12-ตารางสรุป-ใคร-approve-อะไรได้บ้าง)
13. [Drawer / Modal ทั้งหมด และแท็บข้างใน](#13-drawer--modal-ทั้งหมด)
14. [สถานะทั้งหมดในระบบ](#14-สถานะทั้งหมดในระบบ)
15. [กฎเหล็ก 12 ข้อที่ database บังคับ](#15-กฎเหล็ก-12-ข้อที่-database-บังคับ)
16. [เจอปัญหาแบบนี้ ทำยังไง](#16-เจอปัญหาแบบนี้-ทำยังไง)

---

## 1. บทบาทในระบบ

ระบบรู้จัก **10 บทบาท** ระบบเดาบทบาทให้อัตโนมัติจากช่อง `Role` ในหน้า Settings › Members

| บทบาท | ใครใช้ | หน้าที่หลักในระบบ |
|---|---|---|
| **CMO** | คุณ | อนุมัติทุกอย่าง · เป็น override ของทุกกฎ |
| **Marketing Manager / BGL** | Pupay | เจ้าของแบรนด์ · ตรวจข้อมูลบนอาร์ตเวิร์ก · แก้แคมเปญได้ |
| **Marketing Executive** | — | เปิดแคมเปญ · วางแผนโพสต์ · บรีฟงาน |
| **Creative Leader** | Pichayaporn | คุมคิวงานครีเอทีฟ · มอบหมายคนเขียนแคปชั่น · ตรวจ Visual CI · ปล่อยงานเร่งด่วน |
| **Senior Graphic Designer** | Jungjing, QA Test | รับงาน · ทำอาร์ตเวิร์ก · ส่งงาน |
| **VDO Editor** | Four, Jeeno | รับงานวิดีโอ · ส่ง storyboard · ส่งไฟล์ตัด |
| **Co-ordinator** | Saii | ประสานงานข้ามทีม · **จ่ายเงิน (Mark Paid)** · แก้ Team Calendar |
| **KOL Specialist** | Ninew | ดีล KOL · คุมสัญญา · เก็บผลงาน |
| **Content Creator** | — | เขียนแคปชั่น |
| **Agency (External)** | เอเจนซี่ภายนอก | เห็นแค่หน้า `/agency` งานที่ถูกมอบหมายให้ตัวเองเท่านั้น |

### เมนูที่แต่ละคนเห็น

เมนูซ้ายมือถูกกรองตาม Permission Matrix — โมดูลไหนที่ระดับเป็น `—` เมนูจะหายไป

| เมนู | คุมด้วยโมดูล | ใครไม่เห็น |
|---|---|---|
| Campaigns · Performance Center · Platform Performance · Requests · Ads | **Campaign** | ไม่มี (ทุกคนอย่างน้อย View) |
| Content Plan | **Content** | Finance |
| Graphic Request · Assets | **Graphic** | KOL Specialist, Content Creator, Finance |
| KOL | **KOL** | Designer, VDO Editor, Content Creator, Finance |
| Finance | **Finance** | Creative Leader, Designer, VDO Editor, KOL Specialist, Content Creator |
| Settings | **Settings** | ทุกคนยกเว้น CMO |
| **Expenses** (ขอเบิกเงินของตัวเอง) | *ไม่กั้น* | **ทุกคนเข้าได้** — การขอเบิกเงินเป็นเรื่องของทุกคน |
| My Tasks · Team · Team Calendar · Trash · Status Board | *ไม่กั้น* | ทุกคนเข้าได้ |

**Agency (External)** ถูกดีดออกจากทุกหน้ายกเว้น `/agency` โดยอัตโนมัติ 🔒 (ทั้งหน้าจอและ RLS)

---

## 2. Permission Matrix

ตารางจริงบน production (แก้ได้ที่ Settings › Permissions — เฉพาะ CMO)

ระดับสิทธิ์เรียงจากต่ำไปสูง: `—` (ไม่เห็น) → `View` → `Edit` → `Approve` → `Admin`

| บทบาท | Campaign | Graphic | KOL | Finance | Content | CRM | Settings |
|---|---|---|---|---|---|---|---|
| **CMO** | Admin | Admin | Admin | Admin | Admin | Admin | Admin |
| **Marketing Manager / BGL** | Approve | Approve | Approve | View | Approve | Approve | — |
| **Creative Leader** | Edit | **Approve** | View | View | View | — | — |
| **Marketing Executive** | Edit | View | View | — | Edit | Edit | — |
| **Co-ordinator** | Edit | View | View | **Edit** | View | View | — |
| **Senior Graphic Designer** | View | Edit | — | — | View | — | — |
| **VDO Editor** | View | Edit | — | — | View | — | — |
| **KOL Specialist** | View | — | **Edit** | — | View | — | — |
| **Content Creator** | View | — | — | — | **Edit** | Edit | — |
| **Agency (External)** | — | Edit | — | — | Edit | — | — |

> ⚠️ ในตาราง `permissions` ของ database มี 17 แถว — อีก 7 แถว (`Admin / CMO`, `Brand Lead`, `Branch Manager`, `Designer`, `Finance`, `Planner`, `Viewer`) เป็นบทบาทเก่าที่แอปไม่ได้ใช้แล้ว **แต่อย่าลบ** เพราะถ้ามีคนตั้ง Role ตรงกับชื่อพวกนี้ ระบบจะอ่านสิทธิ์จากแถวนั้น

> ⚠️ **จุดที่ต้องระวัง** — ถ้าตั้ง Role ใหม่ที่ **ไม่มีแถวในตารางนี้** ระบบจะให้สิทธิ์ระดับ staff อัตโนมัติ (fail-open) ไม่ใช่ปิดทั้งหมด · ทุกครั้งที่เพิ่มบทบาทใหม่ ต้องเพิ่มแถวใน Settings › Permissions ด้วยเสมอ

---

## 3. ภาพรวม Flow ทั้งเส้น

```
┌─ ขั้น 1 ─────────────────────────────────────────────────────────┐
│ Marketing Executive / MM / Co-ordinator / CMO                    │
│ เปิดแคมเปญที่ /campaigns/new (Campaign Builder 7 ขั้น)            │
│ → Draft → Ready for Review → ส่ง Waiting for Approval             │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌─ ขั้น 2 ─────────────────────────────────────────────────────────┐
│ 🔒 CMO เท่านั้น: Approve → In Progress                            │
│ ★ ก่อนถึงตรงนี้ Creative "รับงาน" ไม่ได้ (database บล็อก)          │
└──────────────────────────┬───────────────────────────────────────┘
          ┌────────────────┼────────────────┬──────────────┐
          ▼                ▼                ▼              ▼
┌─ ขั้น 3 ────────┐ ┌─ ขั้น 4 ─────┐ ┌─ ขั้น 6 ───┐ ┌─ ขั้น 7 ─────┐
│ Content Plan    │ │ Graphic Req  │ │ KOL        │ │ ขอเบิกเงิน   │
│ + Caption       │ │ (บรีฟงาน)     │ │ 12 ขั้น    │ │ Waiting →    │
│ Creative Leader │ │ Creative รับ  │ │ ห้ามข้ามขั้น│ │ Approved →   │
│ มอบหมายคนเขียน  │ │ งาน → บรีฟล็อก│ │            │ │ Paid         │
└────────┬────────┘ └──────┬───────┘ └─────┬──────┘ └──────┬───────┘
         │                 ▼                │                │
         │        ┌─ ขั้น 5 ────────────┐   │                │
         │        │ ตรวจ 2 ด่าน:        │   │                │
         │        │ ① ข้อมูล (ผู้ขอ/MM)  │   │                │
         │        │ ② Visual CI (CL)    │   │                │
         │        │ ★ ต้องคนละคน        │   │                │
         │        │ ผ่านทั้งคู่ → Approved│   │                │
         │        │ → Delivered → Assets │   │                │
         │        └──────────┬──────────┘   │                │
         └──────────────────┬┴──────────────┴────────────────┘
                            ▼
┌─ ขั้น 8 ─────────────────────────────────────────────────────────┐
│ โพสต์จริง → เก็บผลลง Performance Center                            │
│ 🔒 CMO ปิดแคมเปญ: In Progress → Completed                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## ขั้นที่ 1 — เปิดแคมเปญ

**ที่ไหน:** เมนู `Campaigns` → ปุ่ม **+ Create Campaign** → หน้า `/campaigns/new`

**ใครกดปุ่มนี้ได้:** บทบาทที่มี Campaign ≥ **Edit** 👁
→ ✅ CMO · Marketing Manager / BGL · Marketing Executive · Creative Leader · Co-ordinator
→ ❌ Designer · VDO Editor · KOL Specialist · Content Creator (Campaign = View เท่านั้น)
🔒 database ก็บล็อกซ้ำอีกชั้น (`has_module('Campaign','Edit')` ตอน INSERT)

### Campaign Builder มี 7 ขั้น (แถบซ้ายในหน้า)

| # | ขั้น | ต้องกรอกอะไร (ช่องที่มี * คือบังคับ) |
|---|---|---|
| 1 | **Campaign Overview** | ชื่อแคมเปญ* · Brand · Branch* · Campaign Type · Objective · Priority · **Reach goal\* · CV%\*** (Visit คำนวณให้เอง) · Start/End/Launch Date* · Target Audience* · Key Message* · Main Offer* · Channels · Promotion หน้าร้าน · Proposal Link |
| 2 | **Content Plan** | รายการโพสต์ที่จะทำ (แตกเป็น content_posts อัตโนมัติตอน submit) |
| 3 | **Budget Allocation** | งบแยกรายหมวด |
| 4 | **KOL Plan** | KOL ที่จะใช้ (แตกเป็นแถว KOL อัตโนมัติ) |
| 5 | **Auto Task Preview** | ระบบแสดงงานที่จะสร้างให้ดูก่อน |
| 6 | **Guideline Checklist** | เช็กลิสต์กันตกหล่น |
| 7 | **Submit** | ส่งเข้าอนุมัติ |

**ทางลัด:** ปุ่ม **Import จาก Google Sheet** ที่ขั้น 1 — ดึงบรีฟจาก template sheet เข้ามาทั้งชุด (1 sheet = 1 แคมเปญ · sheet ต้องแชร์แบบ Anyone with link)

### ปุ่มในหน้านี้

- **💾 Save Draft** — เซฟไว้ก่อน ยังไม่ส่ง สถานะ `Draft`
- **↗ Submit Campaign** — ส่งเข้าอนุมัติ · กดไม่ได้ถ้ายังมีช่อง* ว่าง หรือมี warning ที่ยังไม่ติ๊กรับทราบ
- ถ้างบเกินเพดาน จะขึ้น **budget guard warning** และปุ่ม Submit จะถูกปิด

### สถานะแคมเปญเดินยังไง

```
Draft ──► Ready for Review ──► Waiting for Approval ──► Approved ──► In Progress ──► Completed
  ▲                                      │
  └──────── Need Revision ◄──────────────┘  (CMO ตีกลับ)
```

**ใครกดส่งได้:** ใครก็ได้ที่แก้แคมเปญได้ ตอนสถานะเป็น `Draft` / `Need Revision` / `Ready for Review`

---

## ขั้นที่ 2 — CMO อนุมัติแคมเปญ

**ที่ไหน:** `Campaigns` → คลิกการ์ดแคมเปญ → หน้ารายละเอียด แถบบนสุดจะขึ้นแถบสีทอง **"Waiting for Approval · CMO"**
หรือดูรวมที่ `My Tasks` → แท็บ **My approvals**

### 🔒 กฎเหล็กข้อที่สำคัญที่สุดของระบบ

**เฉพาะ CMO เท่านั้น** ที่ย้ายแคมเปญเข้าสถานะ `Approved` / `In Progress` / `Completed` ได้
คนอื่นกด = database ปฏิเสธ ขึ้นข้อความ *"เฉพาะ CMO เท่านั้นที่ย้ายแคมเปญเข้าสถานะ Approved ได้"*

และ **แคมเปญที่อนุมัติแล้ว ออกจากสถานะเดิมได้ทางเดียว** คือส่งกลับเป็น `Waiting for Approval` ให้ CMO อนุมัติใหม่ — กันคนแอบดึงแคมเปญที่อนุมัติแล้วกลับไปแก้เงียบ ๆ

### ✏️ แก้แคมเปญที่อนุมัติไปแล้ว — งานไม่หยุด แต่ CMO ต้องเคลียร์ทีหลัง

เดิมทีการแก้แคมเปญที่อนุมัติแล้ว *ทุกกรณี* จะถอนอนุมัติทิ้ง แล้วเด้งกลับไปรออนุมัติใหม่ — แก้ typo ในแคปชั่นก็หยุดทั้งแคมเปญ
ตอนนี้แยกเป็น 2 ระดับ และ **แคมเปญไม่เปลี่ยนสถานะเลย ทีมทำงานต่อได้ทันที**

| ระดับ | แก้อะไร | เกิดอะไรขึ้น |
|---|---|---|
| **ต้องอนุมัติย้อนหลัง** | งบทุกก้อน · แบ่งงบรายเดือน · ช่วงแคมเปญ / Launch · แบรนด์ · สาขา · Objective / Type · Channels · เป้า (Reach, CV%…) · **เพิ่ม/ลบ** Content · เพิ่ม/ลบ KOL หรือแก้งบ / จำนวน / เพจ KOL · เปลี่ยนชื่อแคมเปญ | เข้าคิวที่หน้า **Approvals** + DM หา CMO |
| **แค่บันทึกไว้** | caption · main message · CTA · mandatory text · do/don't · sub head · platform · วันโพสต์ / graphic due · ติ๊ก graphic/VDO · ชื่อ Content · audience / key message / offer · ช่วงโพสต์ KOL | ลง Approval log + ขึ้นกระดิ่ง ไม่ต้องกดอะไร |

**CMO เคลียร์คิวที่:** `Approvals` (เมนูซ้าย กลุ่ม QA — เห็นเฉพาะ CMO)
กด **อนุมัติ** ทีละรายการ ทีละแคมเปญ หรือ **อนุมัติทั้งหมด** ทีเดียวก็ได้ · ถ้าไม่เห็นด้วยกด **ตีกลับ** แคมเปญจะกลับไปเป็น `Need Revision` และคนแก้จะได้ DM
ทุกวันจันทร์ 18:00 ระบบ DM สรุปว่ายังค้างกี่รายการ (ถ้ารายการเก่าสุดค้างเกิน 7 วันจะเตือนเพิ่ม)

> ⚠️ ตีกลับ **ไม่ลบ** โพสต์/ใบงานที่สร้างไปแล้ว — ของที่ออกไปแล้วต้องไปจัดการเอง

### ปุ่มที่ CMO เห็น (ตามสถานะ)

| สถานะปัจจุบัน | ปุ่มที่ขึ้น | ใครกดได้ |
|---|---|---|
| Draft / Need Revision / Ready for Review | **ส่งขออนุมัติ** | ทุกคนที่แก้แคมเปญได้ |
| Waiting for Approval | **Approve** / **ตีกลับ (Need Revision)** | 🔒 CMO เท่านั้น |
| Approved | **เริ่มงาน (In Progress)** | 🔒 CMO เท่านั้น |
| In Progress | **ปิดงาน (Completed)** | 🔒 CMO เท่านั้น |

**ตอนตีกลับ ต้องใส่เหตุผล** — ระบบจะยิงแจ้งเตือนกลับไปหาคนที่ส่ง

### สิทธิ์อื่นในหน้าแคมเปญ

| ทำอะไร | ใครทำได้ |
|---|---|
| แก้ข้อมูลแคมเปญ | 👁 CMO · Marketing Manager / BGL |
| เปลี่ยนสถานะ | 🔒 CMO |
| ลบแคมเปญ (ลงถังขยะ) | 🔒 CMO |
| ดูปุ่ม Brief (ดูบรีฟเต็ม) | 👁 CMO · Marketing Manager / BGL |
| กู้คืนจากถังขยะ | หน้า `Trash` |

---

## ขั้นที่ 3 — Content Plan + Caption

**ที่ไหน:** เมนู `Content Plan` (`/content`) — มีมุมมองปฏิทิน / การ์ด / ลิสต์

### ใครทำอะไรได้

| ทำอะไร | ใครทำได้ | หมายเหตุ |
|---|---|---|
| **สร้าง / แก้ / ย้ายโพสต์ไปแคมเปญอื่น** | 👁 CMO · Marketing Manager / BGL · Marketing Executive · Co-ordinator | ฝั่งวางแผนเป็นเจ้าของตาราง — ครีเอทีฟอ่านแล้วผลิตตาม ไม่ใช่คนเลื่อนตาราง |
| **เปลี่ยนสถานะโพสต์** | 👁 Content Creator · Creative Leader · CMO | |
| **มอบหมายคนเขียนแคปชั่น (Owner)** | 🔒 **Creative Leader** หรือ CMO เท่านั้น | คนเดียวกับที่แจกงานให้ดีไซเนอร์ จะได้มีคนเดียวที่รู้ว่าใครถืออะไรอยู่ |
| เขียน / แก้แคปชั่น | Content Creator ที่ถูกมอบหมาย | |

> 🔒 ข้อ "มอบหมายคนเขียนแคปชั่น" มี trigger `content_owner_guard` บังคับที่ database — คนอื่นแก้ช่อง owner ไม่ได้เลยแม้ยิง API ตรง

### ⚠️ ล็อกสำคัญ: โพสต์ที่ Creative รับงานไปแล้ว แก้ไม่ได้

เมื่อฝั่ง Creative กด **"รับงาน"** ที่ Graphic Request ที่ผูกกับโพสต์นี้ → โพสต์จะ **ล็อกทันที**
ฝั่ง Marketing จะแก้หรือย้ายแคมเปญไม่ได้ ขึ้นข้อความ:

> *"[ชื่อคน] รับงานนี้แล้ว (วันที่) — แก้ไข/ย้ายแคมเปญไม่ได้ ต้องแจ้ง Creative ให้ปล่อยงานคืนก่อน"*

**CMO ก็ไม่ได้รับการยกเว้นข้อนี้** — เพราะล็อกนี้ปกป้องงานที่คนกำลังทำอยู่ ถ้าจะแก้ต้องคุยกับ Creative ให้กด **"ปล่อยงานคืน"** ก่อน

### Content Drawer มีแท็บอะไร

เปิดโพสต์ → drawer ด้านขวา · แท็บ: **Overview · Caption · Approval · Publish**
(แท็บ Publish จะมี 🔒 ถ้ายังไม่ได้เชื่อม Meta · การกดโพสต์ขึ้น Meta จริงต้องมีสิทธิ์ Content ≥ Approve 🔒)

---

## ขั้นที่ 4 — Graphic Request

**ที่ไหน:** เมนู `Graphic Request` (`/graphic`) → ปุ่มสร้างใบงาน หรือสร้างจากโพสต์ใน Content Plan

### 4.1 เปิดใบงาน (ฝั่ง Marketing)

ต้องกรอก: ชื่องาน* · แพลตฟอร์ม* · แคมเปญ* · วันส่งงาน (Graphic Due Date)* · ลิงก์บรีฟ (ช่องเดียว)

### 4.2 ⚡ กฎเดดไลน์บรีฟ — 3 ข้อ ที่ถ้าแหกต้องขออนุมัติ

ระบบ **ไม่ห้าม** แต่จะ **ประทับตราว่าแหกกฎข้อไหน** แล้วส่งให้ Creative Leader ตัดสิน
(กฎที่แหกได้แบบเห็น ๆ บังคับได้ดีกว่ากฎที่หลบได้เงียบ ๆ)

| # | กฎ | ข้อความที่ขึ้น |
|---|---|---|
| 1 | **เดดไลน์รายเดือน** — งานที่ส่งมอบเดือนหน้า ต้องบรีฟภายในวันที่ **25** ของเดือนนี้ | *"เลยเดดไลน์ส่งบรีฟ — งานที่ส่งมอบเดือน YYYY-MM ต้องบรีฟภายใน YYYY-MM-25"* |
| 2 | **Lead time 5 วันทำการ** ต่อ 1 ใบงาน | *"กระชั้นกว่าที่ตกลงกัน — วันส่งงานเร็วสุดคือ …"* |
| 3 | **โควตาต่อวัน** — จำกัดจำนวนชิ้นงานแต่ละประเภทต่อ 1 วันส่ง | *"เกินโควตา [ประเภท] วันที่ … — ใช้แล้ว X + งานนี้ Y จากโควตา Z"* |

**ใครอนุมัติงานเร่งด่วน (rush):** 👁 **Creative Leader** หรือ **CMO** — จงใจ *ไม่ใช่* คนที่ขอ เพราะคนรีบไม่ควรเป็นคนตัดสินว่าเดือนนี้รับไหวไหม
**ใครแก้วันตัด (cutoff day):** Creative Leader / CMO ที่หน้า `/graphic`

### 4.3 Creative รับงาน

**ปุ่ม "รับงาน"** ขึ้นให้เมื่อครบ 3 เงื่อนไข:
1. คุณ **ไม่ใช่** คนขอเปิดงาน
2. คุณเป็นสายครีเอทีฟ (Creative Leader / Designer / VDO Editor / Agency) หรือเป็น CMO
3. 🔒 **แคมเปญต้องผ่านการอนุมัติจาก CMO แล้ว**

> 🔒 ข้อ 3 บังคับที่ database (`graphic_accept_guard`) — ถ้าแคมเปญยังเป็น Draft / Planning / Ready for Review / Waiting for Approval / Need Revision / Cancelled จะขึ้น:
> *"แคมเปญนี้สถานะ "X" — CMO ยังไม่อนุมัติ จึงยังรับงานไม่ได้ (วางแผน/แก้บรีฟได้ตามปกติ)"*

พอรับงานแล้ว → **บรีฟล็อก + โพสต์ต้นทางล็อก**

### 4.4 ✋ อยากเติมบรีฟหลังรับงานแล้ว ต้องขอ

| ขั้น | ใครทำ | เกิดอะไรขึ้น |
|---|---|---|
| 1. กด **"ขอเติมบรีฟ"** + เขียนเหตุผล | คนขอเปิดงาน (หรือ CMO) | สถานะ `Pending` · ยิงแจ้งเตือนหา Creative Leader |
| 2. **ปล่อยงานให้แก้** / **ไม่ปล่อย** | 👁 **Creative Leader เท่านั้น** (CMO ก็ไม่ได้!) | `Granted` / `Rejected` |
| 3. แก้บรีฟ + เซฟ | คนขอ | **สิทธิ์ถูกใช้ไป 1 ครั้ง** — รอบหน้าต้องขอใหม่ |

ข้อความที่ขึ้นเมื่อยังแก้ไม่ได้:
- ยังไม่ได้ขอ → *"[ชื่อ] รับงานนี้ไปแล้ว — ต้องขอเติมบรีฟกับ Creative Leader และรอปล่อยงานก่อน"*
- ขอแล้วรออยู่ → *"ส่งคำขอเติมบรีฟแล้ว — รอ Creative Leader ปล่อยงานให้แก้"*
- ถูกปฏิเสธ → *"Creative Leader ยังไม่ปล่อยให้แก้บรีฟรอบนี้ — คุยกับ [ชื่อ] ก่อนขอใหม่"*

### 4.5 เซ็นรับบรีฟ (Brief sign-off)

👁 คนที่ **ไม่ใช่ผู้ขอ** และเป็นสายครีเอทีฟ หรือ CMO — กันคนบรีฟเซ็นรับบรีฟตัวเอง

### 4.6 งานวิดีโอ (VDO) มีขั้นเพิ่ม: Storyboard

| ขั้น | ใครทำ |
|---|---|
| ส่ง storyboard | VDO Editor ที่รับงาน |
| **อนุมัติ / ส่งกลับแก้ storyboard** | 👁 **คนขอเปิดงาน** หรือ CMO |
| ส่งไฟล์ footage / ไฟล์ตัด | VDO Editor |

### 4.7 Graphic Drawer มี 6 แท็บ

**Overview · Brief · Assets · Feedback · Approval · Delivery**

### สถานะใบงาน Graphic

```
New Request → In Progress → Waiting Feedback → Revision Requested
            → Waiting Approval → Approved → Delivered
```
ปุ่ม **Deliver** (ส่งมอบ) ขึ้นเฉพาะตอนสถานะเป็น `Approved` เท่านั้น

---

## ขั้นที่ 5 — ตรวจงาน 2 ด่าน

นี่คือกฎที่ป้องกัน "อนุมัติงานตัวเอง" ที่แข็งแรงที่สุดในระบบ

**อาร์ตเวิร์ก 1 ชิ้นต้องผ่าน 2 ด่าน จาก 2 คน — ไม่ใช่ 2 ช่องที่คนเดียวติ๊ก**

| ด่าน | ชื่อ | ใครตรวจ | ตรวจอะไร |
|---|---|---|---|
| ① | **ข้อมูลถูกต้อง** | **ผู้ขอเปิดงาน** · Marketing Manager / BGL · CMO | ราคา · วันที่ · เงื่อนไข · ชื่อเมนู · สาขา · CTA · ตัวสะกด |
| ② | **Visual CI** | **Creative Leader** · CMO | โลโก้ · ฟอนต์ · สี · ลำดับสายตา · safe area · ความคมของไฟล์ |

### 3 กฎที่บังคับพร้อมกัน

1. **ห้ามผ่านงานที่ตัวเองส่ง** — designer ที่ส่งงาน กด Pass เองไม่ได้
2. **ห้ามเป็นคนเดียวกับที่ให้ verdict อีกด่าน** — CMO คลุมได้ทั้งสองด่าน ถ้าไม่มีข้อนี้ CMO คนเดียวจะเคลียร์ทั้งสองด่านได้ การแยกด่านก็จะเหลือแค่ในกระดาษ
3. **ส่งงานตัวเองกลับไปแก้ (Revise) ทำได้เสมอ** — designer ที่เห็นข้อผิดพลาดของตัวเอง ต้องมีทางเปิดแถวที่ล็อกอยู่กลับมาแก้ · ที่ห้ามคือ "Pass" อย่างเดียว

### ผลลัพธ์

| สถานะ verdict | สถานะแถวงาน |
|---|---|
| ยังมาไม่ครบ 2 ด่าน | ยังเป็น **Waiting review** (ตั้งใจ — designer ที่เริ่มแก้หลังได้ verdict แรก จะต้อง export ใหม่อีกรอบตอน verdict ที่สองมา) |
| ผ่านทั้ง 2 ด่าน | **Approved** |
| มีด่านใดด่านหนึ่งส่งกลับ | **Revision** (การส่งกลับต้องเขียนเหตุผลด้วย ห้ามส่งกลับเปล่า ๆ) |

**เกร็ด:** ถ้าไฟล์เดียวกัน export หลายขนาด/หลายแพลตฟอร์ม ระบบนับเป็น **artwork ชิ้นเดียว** — ตรวจครั้งเดียวมีผลทุกแถว ไม่ต้องกด 10 ครั้งสำหรับงาน 5 ขนาด

### 🔒 Agency ทำอะไรไม่ได้บ้าง (บังคับที่ database)

trigger `graphic_agency_guard` บล็อก Agency จาก:
- เปลี่ยนคนรับผิดชอบ / ผู้ขอ / ผู้อนุมัติ / แบรนด์ / แคมเปญ ของใบงาน
- ย้ายสถานะเป็น `Approved` หรือ `Delivered`
- อนุมัติชิ้นงานของตัวเอง
- เซ็นรับบรีฟ

### ปลายทาง: Assets

งานที่ผ่านครบ 2 ด่านและ Deliver แล้ว → ไหลเข้าหน้า **Assets** อัตโนมัติ (เก็บลิงก์ Drive / Canva)

> ⚠️ **ข้อควรรู้เรื่องความปลอดภัยไฟล์:** ระบบเก็บแค่ *ลิงก์* ไม่ได้เก็บไฟล์ · สิทธิ์เปิดไฟล์จริงอยู่ที่ Google Drive / Canva ทั้งหมด ใครได้ลิงก์ก็เปิดได้ ต้องคุมสิทธิ์ที่ Drive เอง

---

## ขั้นที่ 6 — KOL

**ที่ไหน:** เมนู `KOL` (`/kol`) · **ใครแก้ได้:** KOL Specialist (KOL = Edit) · MM/BGL · CMO

### 12 ขั้นของ KOL — 🔒 ห้ามข้ามขั้น

```
Request → Owner Assigned → Contract Pending → Contract Signed → Brief Sent
→ Content Creating → Draft Submitted → In Review → Approved
→ Scheduled → Posted → Reporting → Completed
```

**กฎการเดินสถานะ:**
- เดินหน้าได้ **ทีละขั้นเท่านั้น** — ข้ามขั้นระบบปฏิเสธ *"ห้ามข้ามขั้น — ต้องผ่าน "X" ก่อน"*
- **ถอยหลังได้เสมอ** (สำหรับแก้/revise)

### เงื่อนไขก่อนเข้าแต่ละขั้น

| จะเข้าขั้น | ต้องมีอะไรก่อน |
|---|---|
| **Owner Assigned** | กำหนด Owner (ทีม KOL) ก่อน |
| **Contract Signed** | เซ็นสัญญาเรียบร้อย **และ** อนุมัติ Rate Card / Proposal แล้ว |
| **In Review** | แนบ Draft / Post link ก่อนส่งรีวิว |
| **Approved** | ต้องมี Draft/Post link |
| **Posted** | ต้องผ่าน Approval แล้ว **และ** แนบ Final Post link |

**การกรอกผลงาน (reach / engagement)** ทำได้ต่อเมื่อโพสต์แล้วและมีลิงก์เท่านั้น

---

## ขั้นที่ 7 — เบิกเงิน / จ่ายเงิน

### 7.1 ขอเบิก — **ทุกคนทำได้**

**ที่ไหน:** เมนู `Expenses` (`/expenses`) — หน้านี้ **ไม่กั้นสิทธิ์** โดยตั้งใจ เพราะการเบิกเงินของตัวเองเป็นเรื่องของทุกคน

🔒 database บังคับตอนสร้างคำขอ:
- ชื่อ **ผู้ขอต้องเป็นตัวคุณเอง** — สร้างคำขอในนามคนอื่นไม่ได้
- สถานะเริ่มต้นต้องเป็น `Waiting Approval` เท่านั้น
- ยอดที่อนุมัติต้องเป็น **0** — ตั้งยอดอนุมัติให้ตัวเองไม่ได้

### 7.2 ใครเห็นคำขอของใคร 🔒

| คุณเป็นใคร | เห็นอะไร |
|---|---|
| ทุกคน | **คำขอของตัวเองเสมอ** |
| คนที่มี Finance ≥ View | คำขอของทุกคน **ในแบรนด์ที่ตัวเองดูแล** |
| Finance = `—` (Creative Leader, Designer, VDO, KOL, Content Creator) | เห็นแค่ของตัวเอง |

### 7.3 อนุมัติ / ตีกลับ

**ใครอนุมัติได้:** 🔒 คนที่มี **Finance ≥ Approve** → ปัจจุบันคือ **CMO เท่านั้น**
(Co-ordinator มี Finance = Edit → **อนุมัติไม่ได้** · MM/BGL มี Finance = View → **อนุมัติไม่ได้**)

**ที่ไหน:** `Finance` → แท็บ Approval หรือ `My Tasks` → แท็บ **My approvals**
**ตีกลับต้องใส่เหตุผล** (`reject_reason`)

### 7.4 จ่ายเงิน (Mark Paid)

**ใครกดได้:** 🔒 **Co-ordinator** หรือ **CMO** เท่านั้น
เหตุผล: คนจ่ายเงินให้ vendor คือ Co-ordinator ดังนั้นคนที่ประกาศว่า "จ่ายแล้ว" ก็ควรเป็นคนเดียวกัน · CMO เก็บสิทธิ์ไว้เผื่อ Co-ordinator ไม่อยู่

คนอื่นกด → *"เฉพาะ Co-ordinator เท่านั้นที่บันทึกรายการเป็น Paid ได้"*

### 7.5 ใครเห็น Spending Log (ยอดใช้จ่ายทั้งบริษัท)

👁 คนที่มี Finance ไม่เท่ากับ `—` → CMO · MM/BGL · Co-ordinator · Creative Leader

### สถานะเงิน

```
Waiting Approval ──► Approved ──► Unpaid ──► Paid
        └──────────► Rejected (ต้องมีเหตุผล)
```

### เอกสารที่ระบบออกให้

- **Payment Voucher** พิมพ์ได้จากหน้า Finance (มีช่องเซ็น + แปลงตัวเลขเป็นตัวอักษรภาษาไทยอัตโนมัติ)
- คำนวณ VAT / หัก ณ ที่จ่าย (WHT) ให้อัตโนมัติ

---

## ขั้นที่ 8 — ปิดแคมเปญ + วัดผล

| ทำอะไร | ที่ไหน | ใครทำได้ |
|---|---|---|
| ดูผลรวมแคมเปญ | `Performance Center` | ทุกคนที่มี Campaign ≥ View |
| ดูผล Ads / Social รายแพลตฟอร์ม | `Platform Performance` | 👁 **ไม่ใช่** สายครีเอทีฟ และ **ไม่ใช่** KOL Specialist (เพราะมีข้อมูลงบ) |
| Import ยอดจริงจาก Google Sheet | `Ads` / `Platform Performance` → ปุ่ม Import | MM / CMO |
| ประเมิน KPI ทีมครีเอทีฟ | `Team KPI` | 👁 CMO แก้ได้ · **⚠️ ปัจจุบันคนอื่นเปิดแล้วเห็นว่างเปล่า** (ดูหมายเหตุท้ายคู่มือ) |
| **ปิดแคมเปญ (In Progress → Completed)** | หน้าแคมเปญ | 🔒 **CMO เท่านั้น** |

---

## 12. ตารางสรุป: ใคร Approve อะไรได้บ้าง

**ตารางนี้คือหัวใจของคู่มือ** — บอกว่าใครมีอำนาจตัดสินอะไร และระบบบังคับที่ชั้นไหน

| # | เรื่องที่ต้องอนุมัติ | ใครอนุมัติได้ | ใครอนุมัติ**ไม่ได้** (แม้อยากช่วย) | บังคับที่ |
|---|---|---|---|---|
| 1 | **อนุมัติแคมเปญ** (→ Approved) | **CMO** | ทุกคน รวม MM/BGL | 🔒 DB trigger |
| 2 | **เริ่มแคมเปญ** (→ In Progress) | **CMO** | ทุกคน | 🔒 DB trigger |
| 3 | **ปิดแคมเปญ** (→ Completed) | **CMO** | ทุกคน | 🔒 DB trigger |
| 4 | **ลบแคมเปญ** | **CMO** | ทุกคน | 🔒 DB policy |
| 5 | **มอบหมายคนเขียนแคปชั่น** | **Creative Leader** · CMO | Marketing ที่เป็นเจ้าของโพสต์ (จงใจ — กันการเลือกคนเขียนให้โพสต์ตัวเอง) | 🔒 DB trigger |
| 6 | **ปล่อยบรีฟให้แก้ (หลังรับงานแล้ว)** | **Creative Leader เท่านั้น** | **แม้แต่ CMO ก็ไม่ได้** | 👁 UI |
| 7 | **อนุมัติงานเร่งด่วน (rush brief)** | **Creative Leader** · CMO | คนที่ขอเปิดงานเอง | 👁 UI |
| 8 | **รับงาน (Accept)** | สายครีเอทีฟที่ไม่ใช่ผู้ขอ · CMO | ผู้ขอเปิดงาน · **และรับไม่ได้ถ้าแคมเปญยังไม่ผ่าน CMO** | 🔒 DB trigger (เงื่อนไขแคมเปญ) |
| 9 | **เซ็นรับบรีฟ** | คนที่ไม่ใช่ผู้ขอ + สายครีเอทีฟ · CMO | ผู้ขอเปิดงาน · Agency | 👁 UI + 🔒 DB (Agency) |
| 10 | **ตรวจด่าน ① ข้อมูล** | **ผู้ขอเปิดงาน** · MM/BGL · CMO | คนที่ส่งงานชิ้นนั้น · คนที่ให้ verdict ด่าน ② ไปแล้ว | 👁 UI |
| 11 | **ตรวจด่าน ② Visual CI** | **Creative Leader** · CMO | คนที่ส่งงานชิ้นนั้น · คนที่ให้ verdict ด่าน ① ไปแล้ว | 👁 UI |
| 12 | **อนุมัติ storyboard (VDO)** | **ผู้ขอเปิดงาน** · CMO | VDO Editor ที่ทำเอง | 👁 UI |
| 13 | **อนุมัติคำขอเบิกเงิน** | Finance ≥ Approve → ปัจจุบัน **CMO เท่านั้น** | Co-ordinator (Finance=Edit) · MM/BGL (Finance=View) | 🔒 DB policy + RPC |
| 14 | **บันทึกจ่ายเงินแล้ว (Mark Paid)** | **Co-ordinator** · CMO | ทุกคน รวม Finance role อื่น | 🔒 DB trigger |
| 15 | **อนุมัติ KOL (→ Approved stage)** | KOL Specialist · MM/BGL · CMO (KOL ≥ Edit) | Designer · VDO · Content Creator | 👁 UI (กติกาข้ามขั้นบังคับใน lib) |
| 16 | **แก้ Permission matrix / Members / Settings** | **CMO** | ทุกคน | 🔒 DB policy |
| 17 | **แก้ Team Calendar** | **CMO** · Co-ordinator | ทุกคน | 👁 UI |
| 18 | **ประเมิน Team KPI** | **CMO** | ทุกคน | 🔒 DB policy |
| 19 | **เชิญสมาชิกใหม่** | **CMO** (Admin) | ทุกคน | 🔒 API + DB |
| 20 | **โพสต์ขึ้น Facebook/Instagram จริง** | ต้องมี Content ≥ **Approve** → CMO · MM/BGL | Content Creator · Marketing Executive | 🔒 API guard |

### กฎที่ **แม้แต่ CMO ก็ทำไม่ได้**

มี 3 ข้อ — ทั้งหมดจงใจ:

1. **ปล่อยบรีฟให้แก้หลังรับงานแล้ว** → Creative Leader เท่านั้น (คิวงานเป็นของ Creative Leader)
2. **แก้/ย้ายโพสต์ที่ Creative รับงานไปแล้ว** → ต้องให้ Creative ปล่อยงานคืนก่อน ("CMO สั่ง" คือการคุยกับ Creative ไม่ใช่ปุ่มที่เขียนทับงานคนอื่นเงียบ ๆ)
3. **ตรวจทั้ง 2 ด่านคนเดียว** → CMO คลุมได้ทีละด่าน แต่ห้ามเป็นคนเดียวกันทั้งสองด่าน

---

## 13. Drawer / Modal ทั้งหมด

ระบบใช้ **Drawer (แผงเลื่อนจากขวา)** เป็นหลัก ไม่ใช่ popup กลางจอ

| Drawer | เปิดจากไหน | แท็บข้างใน | ใครแก้ได้ |
|---|---|---|---|
| **Campaign Detail** | คลิกการ์ดแคมเปญ | **Overview · Brief · Content · KOL · Ads · Budget · Assets · Approval · Result / Report** (9 แท็บ) | แก้: CMO · MM/BGL · สถานะ: CMO |
| **Content Drawer** | คลิกโพสต์ใน Content Plan | **Overview · Caption · Approval · Publish** (4 แท็บ · Publish มี 🔒 ถ้ายังไม่เชื่อม Meta) | ตามตารางขั้นที่ 3 |
| **Graphic Drawer** | คลิกใบงานใน Graphic Request | **Overview · Brief · Assets · Feedback · Approval · Delivery** (6 แท็บ) | ตามตารางขั้นที่ 4–5 |
| **KOL Drawer** | คลิก KOL | **Profile · Campaign · Deliverables · Brief & Assets · Results · Comments** (6 แท็บ · บางแท็บซ่อนตามขั้นของ KOL) | KOL ≥ Edit |
| **Expense / Voucher** | Expenses / Finance | ฟอร์มขอเบิก + ใบสำคัญจ่าย (มีช่องเซ็น) | ทุกคนสร้างของตัวเอง |
| **New Task** | My Tasks → + New Task | ฟอร์มเดียว | ทุกคน |

**ฟอร์มสร้างใหม่** (Campaign Builder, Content Item, KOL Item, Graphic Request) เป็น**หน้าเต็ม / แผงในหน้า** ไม่ใช่ modal

---

## 14. สถานะทั้งหมดในระบบ

### แคมเปญ
`Draft` → `Ready for Review` → `Waiting for Approval` → `Approved` → `In Progress` → `Completed`
แขนง: `Need Revision` · `Cancelled` · `Paused` · `Active` · `Inactive`

### โพสต์ (Content)
`Draft` → `Waiting Design` → `Waiting Approval` → `Scheduled` → `Published`
แขนง: `Failed` · `Missing Asset` · `Revision Requested`
สถานะย่อยในโพสต์: **Caption** (Missing / Draft / Ready / Approved) · **Asset** (No Asset / Waiting Feedback / Final) · **Publish** (Draft / Queued / Scheduled in OS / Scheduled to Meta / Publishing / Published)

### ใบงาน Graphic
`New Request` → `In Progress` → `Waiting Feedback` → `Revision Requested` → `Waiting Approval` → `Approved` → `Delivered`
สถานะชิ้นงานย่อย: `Not submitted` → `Waiting review` → `Approved` / `Revision`

### KOL (12 ขั้น)
`Request` → `Owner Assigned` → `Contract Pending` → `Contract Signed` → `Brief Sent` → `Content Creating` → `Draft Submitted` → `In Review` → `Approved` → `Scheduled` → `Posted` → `Reporting` → `Completed`
แขนง: `Revision Requested` · `Paused` · `Cancelled`

### เงิน
`Waiting Approval` → `Approved` → `Unpaid` → `Paid` · แขนง `Rejected`

---

## 15. กฎเหล็ก 12 ข้อที่ database บังคับ

กฎพวกนี้ **แหกไม่ได้** ไม่ว่าจะยิง API ตรง เขียนสคริปต์ หรือแก้หน้าเว็บ

| # | กฎ | ข้อความที่จะเจอ |
|---|---|---|
| 1 | ไม่ล็อกอิน = อ่านอะไรไม่ได้เลย | (ไม่มีข้อมูลกลับมา) |
| 2 | ล็อกอินแต่ไม่มีชื่อในตาราง Members = อ่านอะไรไม่ได้ | (ไม่มีข้อมูลกลับมา) |
| 3 | เห็นได้เฉพาะแบรนด์ที่ตัวเองดูแล (ทุกโมดูล รวม Task/KOL/Asset) | (ข้อมูลแบรนด์อื่นหายไปเฉย ๆ) |
| 4 | เฉพาะ CMO ย้ายแคมเปญเข้า Approved / In Progress / Completed | *"เฉพาะ CMO เท่านั้นที่ย้ายแคมเปญเข้าสถานะ … ได้"* |
| 5 | แคมเปญที่อนุมัติแล้ว ออกได้ทางเดียวคือกลับไป Waiting for Approval | *"แคมเปญที่อนุมัติแล้ว ออกจากสถานะเดิมได้ทางเดียวคือส่งกลับให้ CMO อนุมัติใหม่"* |
| 6 | เฉพาะ Creative Leader / CMO มอบหมายคนเขียนแคปชั่น | *"เฉพาะ Creative Leader เท่านั้นที่มอบหมายคนเขียนแคปชั่นได้"* |
| 7 | รับงานกราฟิกไม่ได้ถ้าแคมเปญยังไม่ผ่าน CMO | *"แคมเปญนี้สถานะ "X" — CMO ยังไม่อนุมัติ จึงยังรับงานไม่ได้"* |
| 8 | Agency: ห้ามเปลี่ยนผู้รับผิดชอบ / อนุมัติ / ส่งมอบ / อนุมัติงานตัวเอง / เซ็นบรีฟ | *"agency: … is not allowed"* |
| 9 | ขอเบิกเงินได้เฉพาะในนามตัวเอง สถานะเริ่ม Waiting Approval ยอดอนุมัติ 0 | *"บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้"* |
| 10 | เฉพาะ Co-ordinator / CMO บันทึกเป็น Paid | *"เฉพาะ Co-ordinator เท่านั้นที่บันทึกรายการเป็น Paid ได้"* |
| 11 | ห้ามแก้ role / access / brand ของตัวเอง หรือของคนอื่น | *"members: non-admin may not change role/access/brand/email"* |
| 12 | Audit Log แก้ไม่ได้ ลบไม่ได้ และปลอมชื่อผู้ทำไม่ได้ | (ไม่มีแถวถูกแตะ) |

> เวลาเจอข้อความ **"บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้ (ตรวจสิทธิ์ได้ที่ Settings › Permissions หรือแจ้ง CMO)"** แปลว่าชน RLS ของ database ไม่ใช่ระบบพัง

---

## 16. เจอปัญหาแบบนี้ ทำยังไง

| อาการ | สาเหตุ | ทางแก้ |
|---|---|---|
| **กด "รับงาน" ไม่ได้ / ปุ่มไม่ขึ้น** | แคมเปญยังไม่ผ่าน CMO · หรือคุณเป็นคนขอเปิดงานเอง | ให้ CMO อนุมัติแคมเปญก่อน · ให้คนอื่นในทีมครีเอทีฟรับแทน |
| **แก้บรีฟไม่ได้ ขึ้นว่ารับงานไปแล้ว** | Creative รับงานแล้ว บรีฟล็อก | กด **"ขอเติมบรีฟ"** + เขียนเหตุผล → รอ Creative Leader ปล่อย (ปล่อยได้ครั้งละ 1 รอบ) |
| **ย้ายโพสต์ไปแคมเปญอื่นไม่ได้** | ใบงานกราฟิกของโพสต์นี้ถูกรับไปแล้ว | ให้ Creative กด **"ปล่อยงานคืน"** ก่อน · CMO ก็ข้ามข้อนี้ไม่ได้ |
| **กด Approve ชิ้นงานไม่ได้** | คุณเป็นคนส่งงานชิ้นนั้นเอง · หรือคุณให้ verdict อีกด่านไปแล้ว | ให้คนอื่นตรวจด่านที่เหลือ (Revise ยังกดได้เสมอ) |
| **ชิ้นงานยังค้าง Waiting review ทั้งที่ตรวจแล้ว** | มาแค่ 1 ใน 2 ด่าน | ตามอีกด่าน — ด่าน ① = ผู้ขอ/MM · ด่าน ② = Creative Leader |
| **ฟอร์มบรีฟขึ้นเตือนสีส้มว่าเลยเดดไลน์** | แหกกฎเดดไลน์/lead time/โควตา | ส่งได้ตามปกติ แต่จะกลายเป็น rush ต้องให้ Creative Leader อนุมัติ |
| **อนุมัติคำขอเบิกเงินไม่ได้** | Finance ต่ำกว่า Approve | ปัจจุบันมีแต่ CMO ที่อนุมัติได้ |
| **กด Mark Paid ไม่ได้** | ไม่ใช่ Co-ordinator/CMO | ให้ Saii (Co-ordinator) กด |
| **เมนูบางอันหายไป** | Permission matrix ปิดโมดูลนั้นไว้ | Settings › Permissions (CMO เท่านั้น) |
| **เห็นข้อมูลน้อยกว่าเพื่อน** | brand_access ของคุณจำกัดแบรนด์ | Settings › Members → ช่อง Brand access (CMO แก้) |
| **เพิ่มคนใหม่แล้วเขาล็อกอินไม่ได้** | แถวใน Members อย่างเดียวไม่พอ | ต้องส่ง**คำเชิญ**ผ่านปุ่ม Invite (ระบบส่งเมลได้ ~3-4 ฉบับ/ชม.) |
| **ลบของผิด** | — | หน้า `Trash` กู้คืนได้ |

---

## ⚠️ หมายเหตุ 3 ข้อที่รู้อยู่แล้วว่าเป็นปัญหา (จาก audit 1 ส.ค. 2569)

1. **Team KPI** — หน้าจอบอกว่า non-CMO "อ่านได้อย่างเดียว" แต่ database เปิดให้ **CMO อ่านได้คนเดียว** คนอื่นเปิดแล้วจะเห็นว่างเปล่าเสมอแม้ CMO กรอกครบแล้ว · **รอตัดสินใจว่าจะให้ทีมอ่านได้หรือไม่**
2. **ไฟล์งานอยู่นอกระบบ** — Assets เก็บแค่ลิงก์ Drive/Canva สิทธิ์ไฟล์จริงต้องคุมที่ Drive
3. **Audit Log ยังไม่ครอบคลุมทุกอย่าง** — ที่บันทึกแล้ว: เปลี่ยนสถานะแคมเปญ · บรีฟ · สมาชิก · Permission matrix · อนุมัติ/ตีกลับเบิกเงิน · resolve comment
   ที่**ยังไม่บันทึก**: สร้าง/ลบแคมเปญ · Publish ขึ้น Meta · Mark Paid · Export ข้อมูล · สร้าง/แก้/ลบงาน

---

*คู่มือนี้สร้างจากโค้ดจริง — ถ้าแก้กฎในระบบแล้ว อย่าลืมอัปเดตคู่มือด้วย*
