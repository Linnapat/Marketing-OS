# Notifications — LINE group + Email (ของจริง)

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

```bash
curl -X POST https://<your-app>/api/notify \
  -H "Content-Type: application/json" \
  -d '{"event":"approval","title":"🔔 ทดสอบระบบแจ้งเตือน","detail":"ถ้าเห็นข้อความนี้ใน LINE/อีเมล = ใช้งานได้"}'
```

ผลลัพธ์บอกสถานะราย channel: `{"ok":true,"line":true,"email":false,"configured":{...}}`
