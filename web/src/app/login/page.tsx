"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Restrict self sign-up to the company domain (first-time account creation).
const ALLOWED_DOMAIN = "teppenthailand.co.th";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    const db = supabase();
    if (!db) { setMsg("Supabase is not configured."); return; }
    if (mode === "up" && !email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      setMsg(`Sign-up is limited to @${ALLOWED_DOMAIN} emails.`); return;
    }
    setBusy(true); setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace("/");
      } else {
        const { error } = await db.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox — otherwise sign in.");
        setMode("in");
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full text-[14px] px-[13px] py-[11px] rounded-[10px] border border-line2 bg-ivory outline-none";

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

        <div className="text-[18px] font-extrabold mb-1">{mode === "in" ? "Sign in" : "Create account"}</div>
        <div className="text-[12.5px] text-faint mb-5">{mode === "in" ? "Access your team workspace." : `Use your @${ALLOWED_DOMAIN} email.`}</div>

        {!isSupabaseConfigured && (
          <div className="mb-4 text-[12px] rounded-card px-3 py-2" style={{ background: "#FFF5F4", color: "#B33A2E" }}>Supabase env not set — configure it to enable login.</div>
        )}

        <div className="flex flex-col gap-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@teppenthailand.co.th" className={field} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={field}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <button onClick={submit} disabled={busy || !email.trim() || !password}
            className="text-[14px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">
            {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </div>

        {msg && <div className="mt-4 text-[12px] text-muted">{msg}</div>}

        <div className="mt-5 text-[12px] text-faint text-center">
          {mode === "in"
            ? <>First time? <button onClick={() => { setMode("up"); setMsg(null); }} className="font-bold text-accent">Create an account</button></>
            : <>Have an account? <button onClick={() => { setMode("in"); setMsg(null); }} className="font-bold text-accent">Sign in</button></>}
        </div>
      </div>
    </div>
  );
}
