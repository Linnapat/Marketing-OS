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

## 7. คำสั่งสำหรับ AI (ก็อปไปใช้ได้เลย)

**1 sheet = 1 แคมเปญ** — ก็อป template เป็นไฟล์ใหม่ต่อแคมเปญ แล้วสั่ง AI ตามนี้
ใช้ได้ทั้ง Gemini ใน Google Sheets (ให้เติมลงแท็บตรงๆ) และ Claude/ChatGPT (ให้ออกมาเป็นตารางแล้วก็อปวาง)

กรอกเฉพาะ 6 บรรทัดในวงเล็บ `<>` ที่หัวคำสั่ง ที่เหลือปล่อยไว้ทั้งก้อน:

````text
คุณคือ marketing planner ของร้านอาหารญี่ปุ่นในเครือ TEPPEN ช่วยคิดแคมเปญแล้วกรอกลง Google Sheet
ตาม template ของ Marketing OS (แท็บ Overview / Content / KOL / Budget)

โจทย์: <อยากทำแคมเปญอะไร เพื่ออะไร มีอะไรพิเศษ>
แบรนด์: <ชื่อแบรนด์ ตามที่ตั้งใน Settings เช่น Teppen Thailand>
สาขา: <สาขาที่ร่วม เช่น Central World, EmQuartier>
ช่วงแคมเปญ: <2026-08-01 ถึง 2026-08-31>  ·  Launch: <2026-08-05>
งบรวม: <150000> บาท
วันนี้: <2026-07-17>

กติกาที่ห้ามพลาด:
- ห้ามเปลี่ยนชื่อแท็บ ห้ามเพิ่ม/ลบ/สลับคอลัมน์ ห้ามใส่สูตร — ทุกช่องเป็นข้อความหรือตัวเลขล้วน
- วันที่ทุกช่องเป็น text รูปแบบ YYYY-MM-DD เท่านั้น (ห้าม 7/1/2026 เพราะกำกวม)
- ตัวเลขไม่ต้องมี ฿ (มี , ได้) — ทุกวันต้องอยู่ในช่วงแคมเปญ
- ค่าที่เป็นตัวเลือก ต้องเลือกจากลิสต์ด้านล่างเป๊ะๆ ห้ามคิดค่าใหม่เอง ถ้าไม่มีอันที่ตรง ให้เลือกอันที่ใกล้สุด

แท็บ Overview (คอลัมน์ Field | Value — เติมคอลัมน์ Value):
- Objective เลือก 1: Awareness / New Customer / Repeater / CRM / Delivery / Store Visit / Launch / Seasonal / Brand Campaign
- Campaign Type เลือก 1: Online + Offline / Online Only / Offline Only / CRM / LINE / Event / Store Activation /
  Seasonal Promotion / Always-on / Product Launch
- Priority เลือก 1: High / Med / Low
- Channels เลือกได้หลายอัน คั่นด้วย , : Facebook / Instagram / TikTok / LINE OA / Google / In-store / CRM / LINE OA
- Target Audience, Key Message, Main Offer ต้องมีทุกอัน (ระบบบังคับ) — เขียนให้เฉพาะเจาะจง ไม่เอากว้างๆ
- Store Promotion = ข้อความโปรที่ลูกค้าเห็นหน้าร้าน ถ้าแคมเปญนี้ไม่มีโปรหน้าร้านให้เว้นว่าง
- ใส่ Goal: Reach กับ Goal: CV% เป็นตัวเลข (ระบบคำนวณ Visit = Reach × CV% ให้เอง ไม่ต้องใส่)

แท็บ Content (1 แถว = 1 ชิ้นงาน ให้ 3-6 แถว):
- Title และ Sub Head ต้องมีทุกแถว (ระบบบังคับทั้งคู่)
- Type เลือกจาก: Photo / Reel / Short Video / Carousel / Story / Photo album / Photo shoot / VDO shooting /
  LINE Rich Message / Poster / Menu Insert / POSM / Menu book / Artwork / Mock up / Packaging
- Platforms เลือกจาก: Facebook / Instagram / TikTok / LINE OA / Google Business Profile / In-store
- Asset Sizes ต้องครอบคลุม **ทุก** platform ในแถวนั้น (ระบบบังคับ) — ใส่แค่สัดส่วนได้ เช่น 1:1
  ถ้าคนละสัดส่วนต่อ platform ใช้รูป "Instagram: 9:16; Facebook: 1:1"
  สัดส่วนที่มี — Facebook: 1:1, 4:5, 16:9, 9:16 · Instagram: 1:1, 4:5, 9:16 · TikTok: 9:16 ·
  LINE OA: Rich Message 1040×1040, Rich Message 1040×520, Card 1200×628 ·
  Google Business Profile: 1:1, 4:3, 16:9 · In-store: A4 Poster, A3 Poster, Table Tent, POSM Custom
- Needs Graphic / Needs Video ใส่ Yes หรือ No
- ถ้า Needs Graphic = Yes ต้องมี Graphic Due Date และต้อง **ห่างจาก "วันนี้" อย่างน้อย 5 วันทำการ**
  และต้องไม่หลัง Publish Date (ปกติวางไว้ก่อน publish ~1 สัปดาห์)
- Priority: High / Med / Low

แท็บ KOL (1 แถว = 1 เพจ หรือ 1 กลุ่มเพจที่ยังไม่เลือก — ไม่ใช้ KOL ให้เว้นทั้งแท็บ):
- ยังไม่รู้เพจ ใส่แค่ KOL Type + Count ได้ (เว้น Name)
- KOL Type เลือกจาก: Foodie / Lifestyle / Office Worker / Japanese Food / Family / Micro / Nano / Macro
- Platforms เลือกจาก: Instagram / TikTok / Facebook / YouTube / LINE VOOM
- Content Required เลือกจาก: Reel / Story / Post / TikTok (หลายอันคั่นด้วย ,)
- Budget = งบต่อเพจ (ไม่ใช่งบรวมแถว) · Followers ใส่ 120k หรือ 1.2M ได้
- ผลรวมทุกแถว (Budget × Count) ต้องไม่เกินช่อง KOL ในแท็บ Budget

แท็บ Budget (คอลัมน์ Category | Amount):
- Total ต้องเท่ากับงบรวมที่โจทย์ให้
- Ads + KOL + Printing + CRM + Other ต้องไม่เกิน Total (Graphic เป็นค่า production ไม่นับรวม)
- แตกงบ Ads ด้วยแถว "Ads: <platform>" เลือกจาก: Facebook / Instagram · TikTok · Google · LINE Ads ·
  Delivery (Grab/Line etc) · Other — ผลรวมต้องเท่ากับช่อง Ads
- ถ้าแคมเปญข้ามเดือน ต้องมีแถว "Month: YYYY-MM" ทุกเดือน และผลรวม **ต้องเท่ากับ Total เป๊ะ** (ระบบบล็อกถ้าไม่ตรง)

เสร็จแล้วสรุปสั้นๆ ว่าคิดอะไรไว้ และจุดไหนที่คุณเดา/ไม่มั่นใจ ให้ผมตรวจ
````

> **ทำไมต้องบอก "วันนี้" ให้ AI**: กฎ Graphic Due Date นับจากวันที่ขอ ไม่ใช่วันเริ่มแคมเปญ — AI ที่ไม่รู้วันปัจจุบันจะวางวันที่ทำให้ submit ไม่ผ่าน

## 8. Import

Create Campaign → step **Campaign Overview** → เปิด **Import จาก Google Sheet** → วางลิงก์ → **Import**

ฟอร์มจะถูกกรอกให้ พร้อมสรุปว่า import อะไรมาบ้าง และ **warning ทุกอย่างที่ระบบอ่านไม่ออกหรือไม่แน่ใจ** — ตรวจ แก้ แล้วค่อยบันทึก

สิ่งที่ sheet **ไม่มีวันเขียนทับ**: campaign id / เลขแคมเปญ, สถานะ (เป็น Draft เสมอ), planner, ผู้อนุมัติ, approval log
และถ้า sheet ระบุแบรนด์ที่คุณไม่มีสิทธิ์ หรือสาขาที่ไม่ใช่ของแบรนด์นั้น จะถูกตัดทิ้งพร้อมเตือน

## หมายเหตุสำหรับ dev

- route: `web/src/app/api/campaign-brief-sheet/route.ts` (อ่านอย่างเดียว, ไม่เขียน DB)
- mapping: `web/src/lib/data/briefSheet.ts` (pure) — เทสต์ที่ `web/scripts/test-brief-sheet.ts` (`npm test`)
- ⚠️ gviz **ไม่ error เมื่อขอแท็บที่ไม่มี** — มันคืนแท็บแรกพร้อม 200 ทุกแท็บจึงต้องผ่าน `looksLikeTab()` ก่อนใช้ ไม่งั้น sheet ที่มีแค่ Overview จะถูกอ่านซ้ำเป็น Content/KOL/Budget
