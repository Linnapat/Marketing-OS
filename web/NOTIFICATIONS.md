# Notifications — Slack + Email (ของจริง)

> **ช่องทางหลักคือ Slack** ตั้งแต่ 28 ก.ค. 2026 · แผนที่ห้องปัจจุบันตั้งเมื่อ 1 ส.ค. 2026 · ส่วน LINE ยังใช้ได้อยู่ถ้าตั้ง env ของมันไว้
> แต่ค่าเริ่มต้นปิดแล้ว ทุกช่องทางเป็นอิสระต่อกัน ไม่ตั้ง env = ข้ามเงียบๆ

## 0) Slack — ห้องไหนได้อะไร

แผนที่นี้ยึดตามห้องที่ทีมใช้อยู่จริง ไม่ได้ตั้งใหม่:

| งาน | เข้าห้อง | env |
|---|---|---|
| งานกราฟฟิก | `#05_marketing_graphic` | `SLACK_WEBHOOK_URL_GRAPHIC` |
| งาน Content (โพสต์ · แคปชั่น · publish) | `#07_marketing_content` | `SLACK_WEBHOOK_URL_CONTENT` |
| งาน KOL | `#04_marketing_kol` | `SLACK_WEBHOOK_URL_KOL` |
| งาน VDO (งานตัด + งานถ่าย) | `#06_marketing_vdo` | `SLACK_WEBHOOK_URL_VDO` |
| งานทั่วไป — แคมเปญ, task, ขอความช่วยเหลือ | **ไม่เข้าห้อง** DM หาคนที่เกี่ยวข้อง | — |
| **เรื่องเงินทั้งหมด** | **ไม่เข้าห้อง** DM หาคนเดียว | `SLACK_FINANCE_DM` |

> เรื่องเงินไม่โผล่ในห้องไหนเลยโดยตั้งใจ — ตั้ง `SLACK_FINANCE_DM` เป็นอีเมล (หรือชื่อที่มีในตาราง members) ของคนที่จะรับ ถ้าไม่ตั้ง = เงียบสนิท และ Settings จะขึ้นเตือนให้

**Graphic Request เป็นฟอร์มเดียวกันทั้งงานภาพและงานวิดีโอ** ระบบเลยไม่ได้ดูจากโมดูล แต่เรียก `workKind()` (ตัวเดียวกับที่บอร์ดคุมคิวใช้นับ) มาอ่านว่า type ที่คนขอเลือกเป็น VDO ไหม แล้วค่อยตัดสินใจว่าเข้า `#06` หรือ `#05`

**Content แยกออกจาก `#05` เมื่อ 7 ส.ค. 2026** — ตอนที่ยังรวมกัน การอนุมัติแคปชั่นรอบหนึ่งดันงานที่ designer ถูกขอให้แก้หลุดจอไป · ตอนนี้อะไรที่ลิงก์ไป `/content` (อนุมัติ/ตีกลับแคปชั่น, Content อนุมัติ/ตีกลับ, publish, Creative ปล่อยงาน) เข้า `#07` · ส่วนงานกราฟฟิกที่อนุมัติครบแล้วยังอยู่ `#05` แม้ลิงก์จะพาไปที่โพสต์ เพราะ call site นั้นระบุ `team` มาเอง

> **ห้อง Content มีตาข่ายรับไว้ห้องเดียวในระบบ:** ถ้ายังไม่ได้ตั้ง `SLACK_WEBHOOK_URL_CONTENT` มันจะตกไปเข้า `#05_marketing_graphic` เหมือนเดิมแทนที่จะเงียบ — โค้ดขึ้น production ก่อนสร้าง webhook ได้โดยไม่มีใครพลาดการอนุมัติ · ตั้ง env เมื่อไหร่ก็ย้ายห้องทันที ไม่ต้องแก้โค้ด (ห้องอื่นไม่มี fallback ตามเดิม)

### วิธีเอา webhook มา

1. https://api.slack.com/apps → แอป **Marketing OS**
2. เมนู **Incoming Webhooks** → เปิดสวิตช์ **On**
3. **Add New Webhook to Workspace** → เลือกห้อง → Allow · ทำซ้ำให้ครบ 4 ห้อง
4. กด **Copy** ท้ายแต่ละแถว เอาไปใส่ env ตามตารางข้างบน

ห้องไหนยังไม่ได้ตั้ง webhook = งานประเภทนั้นเงียบ (ไม่ fallback ไปห้องอื่น เพราะส่งผิดห้องแย่กว่าไม่ส่ง) — Settings → Integrations จะบอกว่าห้องไหนยังขาด · ข้อยกเว้นเดียวคือ Content ที่ตกไป `#05` ตามที่เขียนไว้ข้างบน เพราะนั่นคือห้องที่มันเคยอยู่ ไม่ใช่ห้องผิด

---

## 0.1) DM รายคน + สรุปเข้าห้องวันละครั้ง

งานที่ "ถึงตัวใครคนหนึ่ง" จะ **DM หาคนนั้นตรง ๆ** ไม่รบกวนห้อง แล้วสรุปรวมเข้าห้องวันละครั้งแทน

| เหตุการณ์ | ใครได้ DM |
|---|---|
| งานใหม่ / โอนงาน / มอบงานกราฟฟิก | คนที่ถูก assign |
| งานกราฟฟิก / VDO ถูกส่งกลับแก้ | designer |
| บรีฟถูกส่งกลับแก้ | คนขอบรีฟ |
| Content / KOL ถูกส่งกลับแก้ | คนที่ต้องแก้ |
| แคมเปญรออนุมัติ | **คนที่ต้องอนุมัติ** |
| แคมเปญอนุมัติแล้ว / ตีกลับ / แตกงาน | planner เจ้าของแคมเปญ |
| ขอความช่วยเหลือใน My Tasks | เจ้าของงาน + คนอนุมัติ |
| เรื่องเงินทุกอย่าง | คนที่ตั้งไว้ใน `SLACK_FINANCE_DM` |

> "แคมเปญรออนุมัติ" ส่งหา**คนอนุมัติ** ไม่ใช่คนส่ง — บอกคนส่งว่าเพิ่งส่งไปเป็นข้อความที่ไม่มีใครต้องทำอะไรต่อ

DM ต้องใช้ bot token (webhook ทำไม่ได้):

1. แอปเดิม → **OAuth & Permissions** → Bot Token Scopes ต้องมี `chat:write`, `im:write`, `users:read`, `users:read.email` → **Reinstall to Workspace**
2. คัดลอก **Bot User OAuth Token** (`xoxb-…`)

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_FINANCE_DM=someone@teppenthailand.co.th
CRON_SECRET=<สุ่มมาสักชุด>        # ป้องกัน endpoint สรุปรายวัน
```

3. รัน `supabase/slack_digest.sql`
4. Deploy — Vercel cron ใน `vercel.json` ยิง `/api/notify/digest` ทุกวัน **11:00 UTC = 18:00 น. บ้านเรา** สรุปเข้า 4 ห้องนั้น (งานทั่วไปกับเรื่องเงินไม่มีสรุป เพราะไม่มีห้องให้สรุปเข้า)

### จับคู่คนยังไง

ในระบบเก็บ assignee เป็น**ชื่อ** เลยไล่เป็นทอด ๆ: ชื่อ → แถวใน `members` → อีเมล → Slack user (`users.lookupByEmail`) · ชื่อที่เขียนไม่ตรงกันก็ยังเจอ เพราะใช้ `lib/identity` ตัวเดียวกับที่ My Tasks ใช้ · id ที่หาเจอแล้ว cache ไว้ใน `org_settings` จะได้ไม่ยิง Slack ซ้ำ

**คนที่หาไม่เจอ** (อีเมลใน Marketing OS ไม่ตรงกับที่ใช้ใน Slack) จะ **ไม่ error และไม่ขวางคนอื่น** — ข้ามเงียบ ๆ แล้วขึ้นเตือนใน **Settings → Integrations** ว่าใครยังไม่ได้รับ DM · ในสรุปรายวันรายการนั้นจะมีป้าย ⚠️ กำกับ

> ยังไม่ตั้ง `SLACK_BOT_TOKEN` = DM ทำไม่ได้ งานที่มีห้องจะกลับไปโพสต์เข้าห้องทันทีเหมือนเดิม ส่วนงานทั่วไปกับเรื่องเงินจะเงียบจนกว่าจะตั้ง

## 1) LINE (ผ่าน LINE Messaging API)

> LINE Notify ปิดบริการแล้ว (มี.ค. 2025) — ต้องใช้ Messaging API ผ่าน LINE Official Account

1. เข้า <https://developers.line.biz/console/> → สร้าง **Provider** (ถ้ายังไม่มี) → สร้าง **Messaging API channel**
   (หรือผูกกับ LINE OA ที่มีอยู่แล้วของ TEPPEN ก็ได้: LINE OA Manager → Settings → Messaging API → Enable)
2. ในแท็บ **Messaging API** ของ channel:
   - กด **Issue** ที่ *Channel access token (long-lived)* → คัดลอกเก็บไว้
   - ปิด *Auto-reply messages* (ไม่งั้นบอทจะตอบทุกข้อความ)
3. **เชิญบอทเข้ากลุ่ม LINE ของทีม** (ต้องเปิด *Allow bot to join group chats* ใน LINE OA Manager → Settings → Messaging API)
4. หา **group ID** (ขึ้นต้นด้วย `C`) — วิธีง่ายสุด:
   - ตั้ง Webhook URL ชั่วคราว (เช่น <https://webhook.site> URL) ในแท็บ Messaging API → Enable webhook
   - พิมพ์อะไรก็ได้ในกลุ่ม → ดู payload ที่เข้ามา → คัดลอก `source.groupId`
   - เสร็จแล้วปิด webhook ได้เลย (ระบบเราใช้ push อย่างเดียว ไม่ต้องมี webhook)
5. ใส่ค่าใน Vercel → Project → Settings → Environment Variables (Production):
   - `LINE_CHANNEL_ACCESS_TOKEN` = token จากข้อ 2
   - `LINE_TO` = group ID จากข้อ 4
6. **Redeploy**

> ฟรี tier ของ Messaging API ส่ง push ได้ ~200–500 ข้อความ/เดือน (แล้วแต่แพลน LINE OA) — ข้อความแจ้งเตือนทีมภายในปกติไม่เกินนี้

## 2) Email (ผ่าน Resend)

1. สมัคร <https://resend.com> (ฟรี 100 อีเมล/วัน) → **API Keys** → สร้าง key
2. ยืนยันโดเมนที่จะใช้ส่ง (Domains → Add) หรือใช้ `onboarding@resend.dev` ทดสอบไปก่อน
3. ใส่ค่าใน Vercel:
   - `RESEND_API_KEY`
   - `NOTIFY_EMAIL_FROM` เช่น `Marketing OS <os@teppenthailand.co.th>`
   - `NOTIFY_EMAIL_TO` เช่น `marketing@teppenthailand.co.th` (คั่นหลายคนด้วย `,`)
4. **Redeploy**

## 3) ลิงก์ในข้อความ

ตั้ง `NEXT_PUBLIC_APP_URL` = URL production คือ `https://marketing-os-linnapats-projects.vercel.app` (ระวัง: `marketing-os.vercel.app` เฉยๆ เป็นโปรเจกต์ของคนอื่น ไม่ใช่ของเรา) เพื่อให้ข้อความแนบลิงก์กดเปิดหน้าที่เกี่ยวข้องได้เลย

## ทดสอบ

วิธีที่ง่ายที่สุดคือปุ่ม **ส่งข้อความทดสอบ** ใน Settings → Integrations · หรือยิงเองก็ได้:

```bash
curl -X POST https://<your-app>/api/notify \
  -H "Content-Type: application/json" \
  -d '{"event":"approval","title":"🔔 ทดสอบระบบแจ้งเตือน","detail":"ถ้าเห็นข้อความนี้ = ใช้งานได้","team":"kol"}'
```

ผลลัพธ์บอกว่าเข้าห้องหรือเป็น DM: `{"ok":true,"slack":true,"team":"kol","dm":{"sent":[],"unresolved":[]},...}`
ใส่ `"team"` (`graphic` / `content` / `kol` / `vdo` / `general` / `finance`) เพื่อบังคับปลายทาง ถ้าไม่ใส่ระบบจะเลือกจาก `link` ให้เอง · ใส่ `"to":["ชื่อ"]` เพื่อทดสอบ DM · `GET /api/notify` ดูได้ว่าห้องไหนตั้ง webhook แล้วบ้าง (ไม่คืนค่า URL ออกมา)
