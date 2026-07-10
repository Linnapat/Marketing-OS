"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/role";

// Browser-friendly one-time seeding tool. Paste the service_role key and click
// Seed — it POSTs to /api/admin/seed. The key stays in this tab and is sent
// only to your own API over HTTPS. Delete/ignore this page after seeding.
export default function AdminSeedPage() {
  const { role } = useRole();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [health, setHealth] = useState<string>("checking…");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => {
      setHealth(
        !h.supabaseConfigured ? "❌ Supabase env not set — add keys in Vercel and redeploy."
        : !h.dbReachable ? `⚠️ Configured but DB not reachable: ${h.error ?? "unknown"}`
        : h.seeded ? `✅ Connected & seeded — brands: ${h.brands}, campaigns: ${h.campaigns}`
        : "✅ Connected — tables empty, ready to seed.",
      );
    }).catch(() => setHealth("could not reach /api/health"));
  }, [result]);

  const seed = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST", headers: { Authorization: `Bearer ${key.trim()}` } });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (e) {
      setResult(`Request failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // Admin-only: seeding writes to every table, so keep it off-limits to others.
  if (role !== "CMO") {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "#F5EFE4", border: "1px solid #E8D5AA", borderRadius: 12, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Admin only</div>
          <div style={{ fontSize: 13, color: "#6b6258", marginTop: 6 }}>This database seeding tool is restricted to CMO.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Seed demo data</h1>
      <p style={{ color: "#6b6258", fontSize: 14, marginTop: 6 }}>
        One-time: copies the built-in demo content into your Supabase tables.
      </p>

      <div style={{ background: "#F5EFE4", border: "1px solid #E8D5AA", borderRadius: 12, padding: "12px 14px", fontSize: 13, margin: "18px 0" }}>
        <b>Status:</b> {health}
      </div>

      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b6258", marginBottom: 6 }}>
        service_role key (from Supabase → API Keys → Reveal)
      </label>
      <input
        type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJ… or sb_secret_…"
        style={{ width: "100%", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5DECF", outline: "none", boxSizing: "border-box" }}
      />
      <button
        onClick={seed} disabled={busy || key.trim() === ""}
        style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: "#fff", background: busy ? "#9A9387" : "#211F1C", border: 0, borderRadius: 10, padding: "11px 20px", cursor: busy ? "default" : "pointer" }}
      >
        {busy ? "Seeding…" : "Seed database"}
      </button>

      {result && (
        <pre style={{ marginTop: 18, background: "#211F1C", color: "#E8E2D6", padding: 16, borderRadius: 12, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap" }}>
          {result}
        </pre>
      )}
    </div>
  );
}
