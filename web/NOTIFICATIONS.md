# Notifications — Slack + Email (ของจริง)

> **ช่องทางหลักคือ Slack** ตั้งแต่ 28 ก.ค. 2026 · ส่วน LINE ยังใช้ได้อยู่ถ้าตั้ง env ของมันไว้
> แต่ค่าเริ่มต้นปิดแล้ว ทุกช่องทางเป็นอิสระต่อกัน ไม่ตั้ง env = ข้ามเงียบๆ

## 0) Slack (ผ่าน Incoming Webhook)

1. ไปที่ https://api.slack.com/apps → **Create New App** → From scratch → เลือก workspace
2. เมนู **Incoming Webhooks** → เปิด **Activate Incoming Webhooks**
3. **Add New Webhook to Workspace** → เลือกแชนแนลที่จะให้แจ้งเตือนเข้า → Allow
   · ทำซ้ำข้อนี้ทีละแชนแนลถ้าจะแยกทีม (ดูตารางข้างล่าง) — แอปเดียวมีได้หลาย webhook
4. คัดลอก Webhook URL (`https://hooks.slack.com/services/…`) ไปใส่เป็น env บน Vercel:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz            # ทีมทั่วไป + fallback
SLACK_WEBHOOK_URL_FINANCE=https://hooks.slack.com/services/aaa/bbb/ccc    # (ไม่บังคับ) #finance
SLACK_WEBHOOK_URL_CREATIVE=https://hooks.slack.com/services/ddd/eee/fff   # (ไม่บังคับ) #creative
```

5. **Redeploy** แล้วเช็คที่ **Settings → Integrations → Slack** — การ์ดจะขึ้น `Connected` พร้อมบอกว่าตอนนี้แยกแชนแนลอะไรบ้าง และมีปุ่ม **ส่งข้อความทดสอบ** ที่ยิงเข้าทุกแชนแนลที่ตั้งไว้จริง ๆ

### แจ้งเตือนไหนเข้าแชนแนลไหน

| แชนแนล | env | เรื่องที่เข้า |
|---|---|---|
| **Finance** | `SLACK_WEBHOOK_URL_FINANCE` | คำขอเบิกงบ · อนุมัติ/ตีกลับเบิกงบ · งบเกินเพดาน · Draft เบิกจากงบแคมเปญ |
| **Creative** | `SLACK_WEBHOOK_URL_CREATIVE` | งานกราฟฟิก · storyboard/footage · บรีฟ · Content · KOL · โพสต์ publish |
| **General** | `SLACK_WEBHOOK_URL` | แคมเปญรออนุมัติ/อนุมัติ/ตีกลับ · งานใหม่ใน My Tasks · ขอความช่วยเหลือ |

ตั้งแค่ `SLACK_WEBHOOK_URL` ตัวเดียว = ทุกอย่างเข้าแชนแนลเดียวเหมือนเดิม (ทีมที่ไม่มี webhook ของตัวเองจะ fallback มาที่นี่) เพิ่มทีละแชนแนลทีหลังได้ ไม่ต้องแก้โค้ด

การจัดกลุ่มดูจากหน้าที่ noti ลิงก์ไป (`/expenses` → Finance, `/graphic` → Creative ฯลฯ) ส่วนงานที่ลิงก์ไป `/my-tasks` แต่เป็นงาน Creative จะระบุทีมตรง ๆ ที่จุดเรียก — กติกาทั้งหมดอยู่ที่ `src/lib/notifyRouting.ts` ไฟล์เดียว

---

## 0.1) DM รายคน เมื่อ assign / revise งาน

งานที่ "ถึงตัวใครคนหนึ่ง" (มอบหมายงาน, ส่งงานกลับไปแก้) จะ **DM หาคนนั้นโดยตรง** ไม่รบกวนแชนแนลทีม แล้วสรุปรวมเข้าแชนแนล**วันละครั้ง**แทน

Webhook ทำ DM ไม่ได้ ต้องใช้ bot token เพิ่ม:

1. ที่ Slack app เดิม → **OAuth & Permissions** → Bot Token Scopes เพิ่ม `chat:write`, `im:write`, `users:read`, `users:read.email` → **Reinstall to Workspace**
2. คัดลอก **Bot User OAuth Token** (`xoxb-…`) ใส่เป็น env:

```
SLACK_BOT_TOKEN=xoxb-...
CRON_SECRET=<สุ่มมาสักชุด>        # ป้องกัน endpoint สรุปรายวัน
```

3. รัน `supabase/slack_digest.sql` (สร้างคิวสรุป + key สำหรับ mapping)
4. Deploy — Vercel cron ใน `vercel.json` จะยิง `/api/notify/digest` ทุกวัน **11:00 UTC = 18:00 น. บ้านเรา**

### จับคู่คนยังไง

ในระบบเก็บ assignee เป็น**ชื่อ** เลยไล่เป็นทอด ๆ: ชื่อ → แถวใน `members` → อีเมล → Slack user (`users.lookupByEmail`) · ชื่อที่เขียนไม่ตรงกันก็ยังเจอ เพราะใช้ `lib/identity` ตัวเดียวกับที่ My Tasks ใช้ (ชื่อ / อีเมล / ชื่อหน้า `@` ถือเป็นคนเดียวกัน) · id ที่หาเจอแล้วถูก cache ไว้ใน `org_settings` จะได้ไม่ยิง Slack ซ้ำ

**คนที่หาไม่เจอ** (อีเมลใน Marketing OS ไม่ตรงกับที่ใช้ใน Slack) จะ **ไม่ error และไม่ขวางคนอื่น** — ข้ามเงียบ ๆ แล้วขึ้นเตือนใน **Settings → Integrations** ว่าใครยังไม่ได้รับ DM บ้าง แก้โดยแก้อีเมลใน Users & Roles ให้ตรงกัน · ในสรุปรายวันรายการนั้นจะมีป้าย ⚠️ กำกับ ว่าไม่มีใครได้ DM

| เหตุการณ์ | ใครได้ DM |
|---|---|
| งานใหม่ / โอนงาน / มอบงานกราฟฟิก | คนที่ถูก assign |
| งานกราฟฟิกถูกส่งกลับแก้ | designer |
| บรีฟถูกส่งกลับแก้ | คนขอบรีฟ |
| Content / KOL ถูกส่งกลับแก้ | คนที่ต้องแก้ |

> ยังไม่ตั้ง `SLACK_BOT_TOKEN` = ทุกอย่างกลับไปเข้าแชนแนลทันทีเหมือนเดิม ไม่มีอะไรพัง

**ถ้าจะเลิกใช้ LINE:** ลบ `LINE_CHANNEL_ACCESS_TOKEN` กับ `LINE_TO` ออกจาก Vercel — ไม่ต้องแก้โค้ด และไม่มีช่วงที่แจ้งเตือนขาด


ปิดช่องว่างจากคู่มือที่เคยต้อง "submit แล้วแจ้งกลุ่ม LINE เอง" — ตอนนี้ระบบส่งแจ้งเตือนให้อัตโนมัติผ่าน `/api/notify` เมื่อ:

| เหตุการณ์ | trigger key | ตัวอย่างข้อความ |
|---|---|---|
| คำขอเบิกงบใหม่ | `approval` | 📥 คำขอเบิกงบใหม่ REQ-2026-XXX · Meta Ads · ฿12,000 → รอ CMO |
| อนุมัติ / ตีกลับคำขอเบิก | `approved` / `rejected` | ✅ อนุมัติเบิกงบ… / ↩️ ตีกลับ… พร้อมเหตุผล |
| แคมเปญ submit / approve / ตีกลับ | `approval` / `approved` / `rejected` | 🎯 แคมเปญรออนุมัติ: … |
| งานใหม่ / โอนงานใน My Tasks | `newTask` | 🗒️ งานใหม่: … มอบหมายให้ … |
| ขอความช่วยเหลือ (Ask for Help) | `mention` | 🆘 Ken ขอความช่วยเหลือ: … |
| งานกราฟฟิก submit / ส่งกลับแก้ | `feedback` / `rejected` | 🎨 ส่งงานกราฟฟิกรอรีวิว: … |
| กราฟฟิกอนุมัติครบทุกชิ้น | `approved` | ✅ อนุมัติครบ — แนบเข้า Content Calendar แล้ว |
| โพสต์ถูก publish | `launch` | 🚀 โพสต์ถูก publish: … |

เปิด/ปิดรายเหตุการณ์และรายช่องทางได้ที่ **Settings → Notifications** (บันทึกลงฐานข้อมูล และ API เคารพค่าที่ตั้งไว้)

ยังไม่ตั้ง env vars? ทุกอย่างเงียบ ๆ เหมือนเดิม — ไม่มีอะไรพัง

---

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
  -d '{"event":"approval","title":"🔔 ทดสอบระบบแจ้งเตือน","detail":"ถ้าเห็นข้อความนี้ = ใช้งานได้","team":"finance"}'
```

ผลลัพธ์บอกสถานะราย channel + แชนแนลที่ใช้: `{"ok":true,"slack":true,"line":false,"email":false,"team":"finance","configured":{...}}`
ใส่ `"team"` เพื่อบังคับแชนแนล ถ้าไม่ใส่ระบบจะเลือกจาก `link` ให้เอง · `GET /api/notify` ดูได้ว่าตอนนี้ตั้ง webhook ไว้ครบไหม (ไม่คืนค่า URL ออกมา)
