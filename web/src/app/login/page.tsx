"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Restrict self sign-up to the company domain (first-time account creation).
const ALLOWED_DOMAIN = "teppenthailand.co.th";

type Mode = "in" | "up" | "forgot" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  // When the user arrives from a password-reset email, Supabase fires this event.
  useEffect(() => {
    const db = supabase();
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { setMode("reset"); setMsg("Enter a new password below."); setErr(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const say = (m: string, isErr = false) => { setMsg(m); setErr(isErr); };

  const submit = async () => {
    const db = supabase();
    if (!db) { say("Supabase is not configured.", true); return; }
    setBusy(true); setMsg(null); setErr(false);
    try {
      if (mode === "in") {
        const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace("/");
      } else if (mode === "up") {
        if (!email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) { say(`Sign-up is limited to @${ALLOWED_DOMAIN} emails.`, true); setBusy(false); return; }
        const { error } = await db.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        say("Account created. If email confirmation is on, check your inbox — otherwise sign in.");
        setMode("in");
      } else if (mode === "forgot") {
        const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
        const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        say("If that email exists, a reset link is on its way. Open it to set a new password.");
      } else if (mode === "reset") {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        say("Password updated. Redirecting…");
        setTimeout(() => router.replace("/"), 900);
      }
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full text-[14px] px-[13px] py-[11px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const titles: Record<Mode, string> = { in: "Sign in", up: "Create account", forgot: "Reset password", reset: "Set a new password" };
  const subtitles: Record<Mode, string> = {
    in: "Access your team workspace.", up: `Use your @${ALLOWED_DOMAIN} email.`,
    forgot: "We'll email you a link to set a new password.", reset: "Choose a new password for your account.",
  };
  const ctaLabel: Record<Mode, string> = { in: "Sign in", up: "Create account", forgot: "Send reset link", reset: "Update password" };
  const showEmail = mode !== "reset";
  const showPassword = mode !== "forgot";
  const canSubmit = (showEmail ? email.trim() !== "" : true) && (showPassword ? password !== "" : true);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ivory p-4">
      <div className="w-full max-w-sm bg-surface border border-line rounded-cardLg p-7 shadow-xl">
        <div className="flex items-center gap-[10px] mb-5">
          <div className="w-9 h-9 rounded-[10px] bg-accent flex items-center justify-center text-panel font-extrabold text-[16px]">M</div>
          <div>
            <div className="text-[16px] font-extrabold leading-none">Marketing OS</div>
            <div className="text-[11px] text-faint mt-[3px]">TEPPEN Group</div>
          </div>
        </div>

        <div className="text-[18px] font-extrabold mb-1">{titles[mode]}</div>
        <div className="text-[12.5px] text-faint mb-5">{subtitles[mode]}</div>

        {!isSupabaseConfigured && (
          <div className="mb-4 text-[12px] rounded-card px-3 py-2" style={{ background: "#FFF5F4", color: "#B33A2E" }}>Supabase env not set — configure it to enable login.</div>
        )}

        <div className="flex flex-col gap-3">
          {showEmail && (
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@teppenthailand.co.th" className={field}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }} />
          )}
          {showPassword && (
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "reset" ? "New password" : "Password"} className={field + " pr-11"}
                onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }} />
              <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          )}

          {mode === "in" && (
            <div className="text-right -mt-1">
              <button onClick={() => { setMode("forgot"); setMsg(null); setErr(false); }} className="text-[12px] font-semibold text-accent">Forgot password?</button>
            </div>
          )}

          <button onClick={submit} disabled={busy || !canSubmit}
            className="text-[14px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">
            {busy ? "…" : ctaLabel[mode]}
          </button>
        </div>

        {msg && <div className="mt-4 text-[12px]" style={{ color: err ? "#B33A2E" : "#6b6258" }}>{msg}</div>}

        <div className="mt-5 text-[12px] text-faint text-center">
          {mode === "in" && <>First time? <button onClick={() => { setMode("up"); setMsg(null); setErr(false); }} className="font-bold text-accent">Create an account</button></>}
          {mode === "up" && <>Have an account? <button onClick={() => { setMode("in"); setMsg(null); setErr(false); }} className="font-bold text-accent">Sign in</button></>}
          {(mode === "forgot" || mode === "reset") && <button onClick={() => { setMode("in"); setMsg(null); setErr(false); }} className="font-bold text-accent">← Back to sign in</button>}
        </div>
      </div>
    </div>
  );
}
