// Send a login invite for a member — the missing half of "add member".
//
// Settings could always INSERT the members row, but with public signup disabled
// (fail-closed auth hardening) nothing ever created the auth account, so an
// invited person could not log in — including real staff. This route completes
// the flow: an ADMIN asks Supabase (service role, server-side only) to invite
// the email; Supabase mails a link where the person sets their own password.
// On their first login the auth hook stamps app_role from their members row and
// activateInvitedMember flips Invited → Active.
//
// Guard rails:
// - caller must be authenticated AND their members row must say access=Admin
//   (checked server-side against the table, never trusted from the client);
// - the target email must already exist in members — the endpoint can only
//   create logins for people the team has listed, never arbitrary accounts.

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, isApiAuthError, API_AUTH_REQUIRED } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "ยังตั้งค่า SUPABASE_SERVICE_ROLE_KEY ไม่ครบ — ส่งคำเชิญจากเซิร์ฟเวอร์ไม่ได้" }, { status: 501 });
  }

  const email = String((await req.json().catch(() => ({})))?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "อีเมลไม่ถูกต้อง" }, { status: 400 });
  }

  // Caller must be an Admin per the members table. In demo mode (auth not
  // enforced) there is no caller identity — refuse rather than open a hole.
  if (!API_AUTH_REQUIRED) {
    return NextResponse.json({ error: "โหมด demo ไม่มีระบบบัญชี — ใช้ได้เฉพาะระบบจริงที่เปิด auth" }, { status: 501 });
  }
  const callerEmail = (guard.user.email ?? "").toLowerCase();
  const { data: caller } = await admin.from("members").select("access").ilike("email", callerEmail).maybeSingle();
  if (caller?.access !== "Admin") {
    return NextResponse.json({ error: "เฉพาะ Admin เท่านั้นที่ส่งคำเชิญได้" }, { status: 403 });
  }

  // Only people the team has listed can be given a login.
  const { data: target } = await admin.from("members").select("email, name, status").ilike("email", email).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "อีเมลนี้ยังไม่อยู่ในรายชื่อสมาชิก — เพิ่มสมาชิกใน Settings ก่อน" }, { status: 404 });
  }

  const redirectTo = process.env.NEXT_PUBLIC_APP_URL || undefined;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) {
    // Already has an account = nothing to do; everything else is a real failure.
    if (/already.*(registered|exists)/i.test(error.message)) {
      return NextResponse.json({ ok: true, already: true, message: "อีเมลนี้มีบัญชีอยู่แล้ว — login ได้เลย" });
    }
    return NextResponse.json({ error: `ส่งคำเชิญไม่สำเร็จ: ${error.message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: `ส่งอีเมลคำเชิญไปที่ ${email} แล้ว — ให้เปิดลิงก์ในเมลเพื่อตั้งรหัสผ่าน` });
}
