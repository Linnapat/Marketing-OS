# KOL / Influencer Master Database

ฐานข้อมูลกลางเก็บโปรไฟล์ KOL/Influencer ที่ **ไม่ผูกกับแคมเปญ** เพื่อให้ค้นหา/เลือกใช้ซ้ำได้ทุกแคมเปญ
พร้อมสะสมสถิติผลงานย้อนหลังไว้คำนวณ Rank ความเหมาะสมของแต่ละเพจ

Migration: [`supabase/kol_master.sql`](supabase/kol_master.sql) — รันครั้งเดียวใน Supabase SQL Editor, ปลอดภัยต่อการรันซ้ำ

---

## ทำไมต้องมีตารางชุดใหม่ (ไม่ใช้ `kols` เดิม)

ตาราง `kols` เดิม (ใน `schema.sql`) เป็น **campaign-scoped** — 1 แถว = KOL 1 รายในแคมเปญ 1 แคมเปญ
และหน้าเว็บ seed ด้วย handle `@tbd`. มันเก็บ "คำขอใช้ KOL ในแคมเปญ" ไม่ได้เก็บ "ตัวตนของเพจ" ที่ใช้ซ้ำได้

ชุดตารางใหม่นี้เก็บเพจจริงไว้ **ครั้งเดียว** ใช้ซ้ำได้ทุกแคมเปญ และสะสมประวัติเพื่อจัดอันดับ
ของเดิมยังอยู่ครบ — เพิ่มแค่คอลัมน์ `kols.kol_id` ไว้ชี้กลับมาที่ master profile

---

## 4 Entities

| ตาราง | หน้าที่ | ความสัมพันธ์ |
|---|---|---|
| `kol_profiles` | โปรไฟล์หลักของ KOL (1 แถว = 1 เพจ/ครีเอเตอร์) | ตารางหลัก |
| `kol_channels` | ช่องทาง/แพลตฟอร์มของ KOL | `kol_profiles` 1‑ต่อ‑หลาย |
| `kol_collaboration_history` | ประวัติร่วมงานจริง (**ต้นทางของ Rank**) | `kol_profiles` 1‑ต่อ‑หลาย |
| `kol_rank_scores` | คะแนน Rank ที่ cache ไว้ (1 แถว = 1 KOL) | คำนวณจาก history + channels |

```
kol_profiles ──1:N──> kol_channels
     │
     ├──1:N──> kol_collaboration_history ─┐
     │                                    ├─> recompute_kol_rank() ──> kol_rank_scores (1:1)
     └── kol_channels ────────────────────┘
```

### หมายเหตุการออกแบบ
- **PK เป็น UUID** (`gen_random_uuid()`) ตาม spec — ต่างจาก `kols` เดิมที่เป็น bigint identity
- **`kol_channels`** มี unique index บน `(kol_id, platform)` → การ sync followers ใหม่ให้ **upsert** ไม่สร้างแถวซ้ำ
- **`brand_feedback_score`** มี `CHECK between 1 and 5`, **`rank_score`** `CHECK between 0 and 100`
- ทุกตารางหลักมีคอลัมน์ `data jsonb` ตาม pattern ของ `schema_v2.sql` เพื่อ round-trip object จาก UI แบบไม่ตกหล่น
- `owner_specialist` อ้าง `members(email)` (ตาราง user เดิมของแอป), `campaign_id`/`brand` อ้าง `campaigns(id)`/`brands(id)`

---

## เกณฑ์คำนวณ Rank

คะแนนเก็บใน `kol_rank_scores.rank_score` (0–100) + `rank_label` (S/A/B/C) + `score_breakdown` (jsonb)
Weights ปรับได้ในตาราง `kol_rank_weights` (แถวเดียว) แล้วเรียกคำนวณใหม่

| องค์ประกอบ | น้ำหนักเริ่มต้น | วิธีคิด |
|---|---|---|
| Engagement vs tier | 25 | ER เฉลี่ยของเพจ เทียบ ER เฉลี่ยของ tier เดียวกัน (เท่าค่าเฉลี่ย = 50, สองเท่า = 100) |
| On-time consistency | 20 | สัดส่วน collab ที่ `on_time_delivery = true` |
| Brand feedback | 20 | `brand_feedback_score` เฉลี่ย (1–5) → 0–100 |
| Budget efficiency | 20 | ROAS เฉลี่ย เทียบ `target_roas` (default 3 = 100 คะแนน) |
| **Audience fit** | 15 | **ไม่รวมใน cache** — ดูด้านล่าง |

### ทำไม audience fit ไม่อยู่ใน cache
"เหมาะกับ target audience" ขึ้นกับ **แบรนด์/แคมเปญที่จะใช้งาน** จึงคำนวณ **ตอนเลือก KOL** โดยเทียบ
`kol_channels.audience_demographic` กับ target ของแบรนด์นั้น ๆ ไม่ใช่ค่าติดตัวที่ cache ล่วงหน้าได้

ดังนั้น `rank_score` ที่ cache = ผลรวมถ่วงน้ำหนักของ **4 องค์ประกอบติดตัว** โดย **renormalize เฉพาะองค์ประกอบ
ที่มีข้อมูลจริง** (KOL หน้าใหม่ที่ยังไม่มีประวัติจะไม่ถูกลงโทษให้คะแนน 0) ส่วน audience fit เอาไปบวกตอน
แสดงผลในฟอร์ม Request KOL ต่อแบรนด์

### ฟังก์ชันที่ให้มา
```sql
select recompute_kol_rank('<kol_id>');   -- คำนวณ + upsert คนเดียว, คืน rank_score
select recompute_all_kol_ranks();        -- คำนวณใหม่ทั้งหมด (หลังแก้ weights หรือ bulk sync)
```
เรียกหลังมี `kol_collaboration_history` ใหม่ หรือหลัง sync followers/ER

---

## จุดเชื่อมกับ Marketing OS (แผนในอนาคต)

### 1. ฟอร์ม "Request KOL" ดึงเพจจริงแทน `@tbd`
ตอนนี้ `buildKol()` ใน [`src/lib/db/kol.ts`](src/lib/db/kol.ts) ตั้ง `h: "@tbd"` เป็น default
เป้าหมายคือเปลี่ยน flow ให้ Specialist มี **2 ทางเลือก**:
1. **ค้นหาจาก master** — query `kol_master_view` (มี `display_name`, `total_followers`, `rank_label`, `rank_score`) แล้วเลือก → เก็บ `kols.kol_id`
2. **สร้าง KOL รายใหม่** — insert `kol_profiles` (+ `kol_channels`) พร้อมกัน แล้ว link `kols.kol_id` เลย เพื่อให้ข้อมูลสะสมต่อเนื่อง

`kol_master_view` ถูกทำมาให้ picker ใช้ตรง ๆ: 1 แถวต่อ KOL รวม followers, platforms, และ rank ล่าสุด

### 2. ปิด loop ประวัติ → Rank
เมื่อแคมเปญจบและมีผลจริง (reach/engagement/ROAS/ตรงเวลา/คะแนนแบรนด์) ให้ insert เข้า
`kol_collaboration_history` (อ้าง `kol_id` + `campaign_id`) แล้วเรียก `recompute_kol_rank(kol_id)`
รอบถัดไปที่เลือก KOS รายนี้จะเห็น rank ที่อัปเดต

### 3. Data-access layer ที่ต้องเพิ่ม (ยังไม่ทำในไฟล์นี้)
เทียบแบบเดิมใน `src/lib/db/kol.ts` แนะนำเพิ่มไฟล์ `src/lib/db/kolMaster.ts`:
- `searchKolProfiles(q)` → `select ... from kol_master_view where display_name ilike ...`
- `createKolProfile(...)`, `addKolChannel(...)`
- `logCollaboration(...)` → insert history + `rpc('recompute_kol_rank', { p_kol })`

> หมายเหตุ: ไฟล์นี้เป็น **schema + rank engine** เท่านั้น ยังไม่แตะ UI/TypeScript
> ขั้นต่อไปคือ DB layer + ฟอร์ม picker ตามข้อ 3

---

## วิธีติดตั้ง
1. เปิด Supabase → SQL Editor → New query
2. วางเนื้อหา [`supabase/kol_master.sql`](supabase/kol_master.sql) แล้ว Run (ต้องเคยรัน `schema.sql` มาก่อน เพราะอ้าง `brands`/`campaigns`/`members`/`kols`)
3. (ทางเลือก) ปรับ weights: `update kol_rank_weights set w_engagement = 30 where id = 1;` แล้ว `select recompute_all_kol_ranks();`
