# Campaign Brief Sheet — Import จาก Google Sheet

วิธีร่างแคมเปญใน Google Sheet (จะให้ AI ช่วยคิดก็ได้) แล้ว **Import เข้าฟอร์ม Create Campaign** ในคลิกเดียว

> **Import = กรอกฟอร์มให้เท่านั้น ไม่ได้บันทึกลงระบบ**
> sheet ข้ามขั้นตอนอะไรไม่ได้เลย — คุณยังต้องตรวจ แก้ แล้วกด Save Draft / Submit เอง
> การอนุมัติของ CMO, required fields และ guard งบเกิน PL Budget ทำงานเหมือนเดิมทุกอย่าง

## 1. เตรียม sheet

**ทางลัด:** ใช้ `web/templates/campaign-brief-template.xlsx` ในรีโปนี้ — ลากขึ้น Google Drive แล้วเปิดด้วย Google Sheets จะได้แท็บครบทั้ง 4 พร้อมตัวอย่างให้แก้ทับ (ตัวอย่างช่วยให้ AI เข้าใจรูปแบบด้วย)

หรือสร้าง Google Sheet เองที่มีแท็บชื่อ **ตรงตามนี้** (ตัวพิมพ์เล็ก/ใหญ่ไม่สำคัญ แต่ชื่อต้องตรง):

| แท็บ | จำเป็น? | รูปแบบ |
|---|---|---|
| `Overview` | **ต้องมี** | 2 คอลัมน์: Field \| Value |
| `Content` | ไม่บังคับ | ตาราง มี header |
| `KOL` | ไม่บังคับ | ตาราง มี header |
| `Budget` | ไม่บังคับ | 2 คอลัมน์: Category \| Amount |

แล้วกด **Share → Anyone with the link → Viewer** (ระบบอ่านผ่าน CSV export ไม่ต้องใช้ Google API key)

> ถ้าแท็บไหนไม่มี ระบบจะข้ามและบอกใน warning — ไม่เดาข้อมูลให้

## 2. แท็บ Overview

```
Field              | Value
Campaign Name      | Wagyu Festival
Brand              | Takao
Branches           | Silom, Thonglor
Objective          | Awareness
Campaign Type      | Online + Offline
Priority           | High
Start Date         | 2026-07-01
End Date           | 2026-07-31
Launch Date        | 2026-07-05
Target Audience    | Office workers 25-40
Key Message        | ที่สุดของวากิว
Main Offer         | เซ็ตวากิว 1,290.-
Store Promotion    | (เว้นว่างได้ — ถ้าไม่มีโปรหน้าร้าน)
Channels           | Facebook, Instagram, TikTok
Concept            | ...
KV Direction       | ...
Proposal Link      | https://...
Goal: Reach        | 500000
Goal: CV%          | 2.5
```

- **แถว `Goal: <metric>`** ตั้งเป้าราย KPI — ใส่ goal แล้ว metric นั้นจะถูกติ๊กเป็น KPI ให้อัตโนมัติ
- **Brand** ใช้ชื่อแบรนด์ตามที่ตั้งใน Settings (เช่น `Takao`, `Touka` — คนละแบรนด์กัน)
- ค่าที่เป็นตัวเลือก (Objective / Campaign Type / Priority / Channels) พิมพ์ตัวเล็กตัวใหญ่ยังไงก็ได้ แต่ถ้าไม่ตรงกับตัวเลือกที่มี ระบบจะ **ไม่เดา** — จะข้ามและเตือน ให้เลือกในฟอร์มเอง

## 3. แท็บ Content

```
Title      | Type  | Platforms            | Asset Sizes        | Publish Date | Graphic Due Date | Priority | Needs Graphic | Needs Video | Caption Direction | Key Message | CTA     | Note
KV Launch  | Photo | Facebook, Instagram  | 1:1                | 2026-07-05   | 2026-06-28       | High     | Yes           | No          | ...               | ...         | จองเลย  | ...
Teaser     | Reel  | Instagram            | Instagram: 9:16    | 2026-07-02   |                  | Med      | No            | Yes         |                   |             |         |
```

- **Asset Sizes**: ใส่แค่สัดส่วน (`1:1`) ก็ได้ → จับคู่กับทุก platform ในแถวนั้นให้เอง
  ถ้าจะเจาะจง platform ใช้ `Instagram: 9:16` คั่นหลายอันด้วย `;`
- **Needs Graphic / Needs Video**: `Yes` / `No`
- แถวที่ไม่มี Title จะถูกข้าม (เว้นบรรทัดว่างได้)

## 4. แท็บ KOL

```
Name          | KOL Type | Platforms | Followers | Count | Budget | Content Required | Posting Start | Posting End | Area  | Owner | Note
@foodie.bkk   | Foodie   | Instagram | 120k      | 1     | 15,000 | Reel             | 2026-07-10    | 2026-07-15  | Silom |       |
              | Micro    | TikTok    |           | 3     | 5000   | Reel, Story      | 2026-07-12    | 2026-07-20  |       |       | ยังไม่เลือกเพจ
```

- ยังไม่รู้ว่าจะใช้เพจไหนก็ได้ — ใส่แค่ `KOL Type` + `Count` พอ
- `Followers` / `Budget` รับ `120k`, `1.2M`, `15,000`, `฿15,000`
- **`Budget` = งบต่อเพจ** (งบรวมของแถว = Budget × Count)

## 5. แท็บ Budget

```
Category                    | Amount
Total                       | 150,000
Ads                         | 60000
KOL                         | 30000
Graphic                     | 10000
Printing                    | 5000
CRM                         | 5000
Other                       | 3000
Other Note                  | ค่าส่งของรางวัล
Ads: Facebook / Instagram   | 40000
Ads: TikTok                 | 20000
Month: 2026-07              | 100000
Month: 2026-08              | 50000
```

- **`Ads: <platform>`** = แตกงบ Ads รายแพลตฟอร์ม, **`Month: YYYY-MM`** = แบ่งงบรายเดือน (ตัวที่ guard เทียบกับ PL Budget)
- ช่อง `KOL` คือ **เพดานงบ KOL** — แท็บ KOL sync ตามนี้ ถ้าแผน KOL รวมเกินเพดาน ฟอร์มจะเตือน
- `Graphic` เป็นค่า production ไม่ถูกนับรวมใน media allocation (ตามกติกาเดิมของระบบ)

## 6. วันที่ — ข้อควรระวัง

ใช้ **`YYYY-MM-DD`** เสมอ (เช่น `2026-07-01`)

`7/1/2026` **กำกวม** — เป็นได้ทั้ง 1 ก.ค. และ 7 ม.ค. ระบบจะอ่านแบบ US (M/D/YYYY) **พร้อมขึ้น warning ให้ตรวจ**
ส่วน `17/7/2026` ไม่กำกวม (17 เป็นวันแน่ๆ) อ่านให้ถูกเงียบๆ
วันที่ที่อ่านไม่ออก (`next friday`) จะเว้นว่างไว้ + เตือน — ไม่เดาให้

> เคล็ดลับ: ถ้าให้ AI เติมใน Sheet ให้สั่งว่า *"วันที่ทุกช่องเป็น text รูปแบบ YYYY-MM-DD"*

## 7. Import

Create Campaign → step **Campaign Overview** → เปิด **Import จาก Google Sheet** → วางลิงก์ → **Import**

ฟอร์มจะถูกกรอกให้ พร้อมสรุปว่า import อะไรมาบ้าง และ **warning ทุกอย่างที่ระบบอ่านไม่ออกหรือไม่แน่ใจ** — ตรวจ แก้ แล้วค่อยบันทึก

สิ่งที่ sheet **ไม่มีวันเขียนทับ**: campaign id / เลขแคมเปญ, สถานะ (เป็น Draft เสมอ), planner, ผู้อนุมัติ, approval log
และถ้า sheet ระบุแบรนด์ที่คุณไม่มีสิทธิ์ หรือสาขาที่ไม่ใช่ของแบรนด์นั้น จะถูกตัดทิ้งพร้อมเตือน

## หมายเหตุสำหรับ dev

- route: `web/src/app/api/campaign-brief-sheet/route.ts` (อ่านอย่างเดียว, ไม่เขียน DB)
- mapping: `web/src/lib/data/briefSheet.ts` (pure) — เทสต์ที่ `web/scripts/test-brief-sheet.ts` (`npm test`)
- ⚠️ gviz **ไม่ error เมื่อขอแท็บที่ไม่มี** — มันคืนแท็บแรกพร้อม 200 ทุกแท็บจึงต้องผ่าน `looksLikeTab()` ก่อนใช้ ไม่งั้น sheet ที่มีแค่ Overview จะถูกอ่านซ้ำเป็น Content/KOL/Budget
