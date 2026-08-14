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

  // Land the invitee on the one screen that can take a password.
  //
  // This used to point at the app root. Supabase happily consumed the token
  // there — email confirmed, session created, last_sign_in_at stamped — and
  // then showed the dashboard. Nothing ever asked for a password, so the
  // invitee had an account they could never sign back into once that first
  // session ended, and the login page answered "Signups not allowed for this
  // instance" when they tried to make one. Narawich sat exactly there on 14 Aug.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const redirectTo = appUrl ? `${appUrl}/login?invite=1` : undefined;
  const invite = () => admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);

  const { error } = await invite();
  if (!error) {
    return NextResponse.json({ ok: true, message: `ส่งอีเมลคำเชิญไปที่ ${email} แล้ว — ให้เปิดลิงก์ในเมลเพื่อตั้งรหัสผ่าน` });
  }
  if (!/already.*(registered|exists)/i.test(error.message)) {
    return NextResponse.json({ error: `ส่งคำเชิญไม่สำเร็จ: ${error.message}` }, { status: 502 });
  }

  // "Already registered" is two different situations and the old code treated
  // them as one, answering "login ได้เลย" to both.
  //
  // Supabase invite links expire after 24 hours. Someone invited on a Friday
  // who opens the mail on Monday has an auth row and no way to use it: the link
  // is dead, they never set a password, and pressing Invite again just repeated
  // "you already have an account — go log in". Four of the team sat like that
  // for twelve days. The button that exists to fix this was the button telling
  // them nothing was wrong.
  //
  // So: find the account and look at whether it was ever actually used.
  const stale = await findUnusedAccount(admin, email);
  if (!stale) {
    return NextResponse.json({ ok: true, already: true, message: "อีเมลนี้มีบัญชีอยู่แล้วและเคยเข้าใช้งาน — login ได้เลย" });
  }

  // Never confirmed and never signed in: nothing is attached to this auth row
  // (the app keys everything off the members table and the email), so replacing
  // it is safe and gives a genuine, freshly-dated invite mail rather than a
  // password-reset notice to someone who never had a password.
  const { error: delErr } = await admin.auth.admin.deleteUser(stale.id);
  if (delErr) {
    return NextResponse.json({ error: `ล้างบัญชีเดิมที่ยังไม่ได้ใช้ไม่สำเร็จ: ${delErr.message}` }, { status: 502 });
  }
  const { error: reErr } = await invite();
  if (reErr) {
    // The old row is gone and the new mail did not go out — say so plainly,
    // because the fix is simply to press Invite again, and a vague error would
    // leave an admin wondering whether they had just deleted someone.
    return NextResponse.json({
      error: `ล้างคำเชิญเดิมแล้วแต่ส่งใหม่ไม่สำเร็จ: ${reErr.message} — กด Invite อีกครั้งได้เลย ` +
             `(ถ้าเพิ่งส่งไปหลายฉบับ อาจติดลิมิตอีเมลของ Supabase ~3-4 ฉบับ/ชม.)`,
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true, resent: true,
    message: `คำเชิญเดิมหมดอายุแล้ว — ส่งคำเชิญใหม่ไปที่ ${email} เรียบร้อย`,
  });
}

/** The auth account for this email, but only when it has never been used —
 *  never confirmed and never signed in. Returns null when the person is a real
 *  active user, so the caller can never delete a working account.
 *
 *  listUsers is paged and has no exact-email lookup in supabase-js v2, so page
 *  through and match. Bounded rather than while(true): a runaway loop against
 *  the auth API is a worse failure than not finding a stale invite. */
async function findUnusedAccount(
  admin: NonNullable<ReturnType<typeof supabaseAdmin>>,
  email: string,
): Promise<{ id: string } | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) {
      const unused = !hit.email_confirmed_at && !hit.last_sign_in_at;
      return unused ? { id: hit.id } : null;
    }
    if (data.users.length < perPage) return null;
  }
  return null;
}
