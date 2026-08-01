"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Lock } from "lucide-react";
import { SidebarContent } from "./Sidebar";
import { Toaster } from "@/components/ui/Toaster";
import { RoleProvider, useRole } from "@/lib/role";
import { AuthProvider, useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { moduleForPath } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase";
import { fetchBrandConfigs } from "@/lib/db/settings";
import { applyBrandOverrides } from "@/lib/brands";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleProvider>
        <AuthGate>{children}</AuthGate>
      </RoleProvider>
    </AuthProvider>
  );
}

/** Redirects unauthenticated users to /login when auth is enforced. Renders the
 *  login route full-bleed (no sidebar). */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === "/login";
  const isAgency = role === "Agency (External)";

  useEffect(() => {
    if (!AUTH_REQUIRED || loading) return;
    if (!user && !onLogin) { router.replace("/login"); return; }
    if (user && onLogin) { router.replace(isAgency ? "/agency" : "/"); return; }
    // External agency users are confined to their portal.
    if (user && isAgency && !onLogin && !pathname.startsWith("/agency")) router.replace("/agency");
  }, [loading, user, onLogin, isAgency, pathname, router]);

  if (onLogin) return <>{children}</>;
  if (AUTH_REQUIRED && loading) {
    return <div className="min-h-screen flex items-center justify-center bg-ivory text-[13px] text-faint">Loading…</div>;
  }
  if (AUTH_REQUIRED && !user) return null; // redirecting

  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  // Hydrate brand name/colour overrides from Settings before the first paint,
  // so edits made in Settings → Brands actually show across the app.
  const [brandsReady, setBrandsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchBrandConfigs()
      .then((cfgs) => { applyBrandOverrides(cfgs); })
      .catch(() => {})
      .finally(() => { if (alive) setBrandsReady(true); });
    return () => { alive = false; };
  }, []);
  // Desktop sidebar can collapse to an icon-only rail; the choice is remembered.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("mos-sidebar-collapsed") === "1");
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    localStorage.setItem("mos-sidebar-collapsed", next ? "1" : "0");
    return next;
  });

  // Brand overrides used to gate the WHOLE shell, so every cold load showed a
  // blank page with a centred "Loading…" and — worse — no navigation, leaving
  // no way out while you waited. The rail and header do not depend on brand
  // colours, so they render immediately now; only the page body waits, and it
  // waits as a skeleton rather than an empty screen.
  return (
    <div className="min-h-screen bg-ivory">
      {/* Desktop sidebar (fixed) */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30">
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 text-white px-4 h-16 border-b border-white/[0.08]" style={{ background: "#17172A" }}>
        <button onClick={() => setDrawer(true)} aria-label="Open menu" className="p-1">
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white font-extrabold text-[13px]" style={{ background: "linear-gradient(135deg, #7C6CF6, #5B4FD8)" }}>
            M
          </div>
          <span className="text-[14px] font-extrabold">MKT Playground</span>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 shadow-2xl">
            <div className="relative h-full">
              <button
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="absolute top-4 -right-11 text-white bg-panel rounded-full p-2"
              >
                <X size={18} />
              </button>
              <SidebarContent onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className={collapsed ? "lg:pl-[78px] transition-[padding] duration-200" : "lg:pl-[248px] transition-[padding] duration-200"}>
        <div className="max-w-content mx-auto px-5 sm:px-6 lg:px-8 pt-5 pb-16">
          <DemoModeBanner />
          {brandsReady
            ? <ModuleGate>{children}</ModuleGate>
            : <PageSkeleton />}
        </div>
      </main>
      <Toaster />
    </div>
  );
}

/** Placeholder shaped like a page header plus a card, so the layout does not
 *  jump when the real content lands. */
function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="กำลังโหลด">
      <div className="h-[64px] rounded-cardLg bg-white/70 border border-line" />
      <div className="mt-4 h-[104px] rounded-cardLg bg-white/50 border border-line" />
      <div className="mt-4 h-[320px] rounded-cardLg bg-white/40 border border-line" />
    </div>
  );
}

/** Says out loud when the app is running on the bundled demo dataset.
 *
 *  Every db/* reader falls back to typed mock data when Supabase is not
 *  configured (`if (!db) return MOCK`), and writes quietly succeed without
 *  storing anything. That is the right behaviour for local development and a
 *  trap everywhere else: drop an env var and the app keeps looking normal while
 *  serving invented campaigns and swallowing saves. A permanent banner is the
 *  cheapest way to make sure nobody reads demo numbers as real ones. */
function DemoModeBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div
      className="mb-4 rounded-card border px-4 py-3 text-[12.5px] font-semibold"
      style={{ background: "#FBF1E9", borderColor: "#E4C79B", color: "#8A5A1E" }}
      role="status"
    >
      โหมด DEMO — ยังไม่ได้เชื่อมฐานข้อมูล ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่าง และการบันทึกจะไม่ถูกเก็บไว้
      <span className="font-normal"> (ตั้ง NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY แล้ว redeploy)</span>
    </div>
  );
}

/** Central page gate: every route is checked against the Settings → Permissions
 *  matrix (via its module), and the external Agency role is confined to /agency
 *  even in demo mode. Individual pages don't need their own guards. */
function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, can } = useRole();

  if (role === "Agency (External)" && !pathname.startsWith("/agency")) {
    return <NoAccess title="External workspace only" detail="บัญชี Agency เข้าถึงได้เฉพาะ Agency Portal — งานภายใน (แคมเปญ งบ KOL รายงาน) ถูกปิดไว้" />;
  }
  const mod = moduleForPath(pathname);
  if (mod && !can(mod)) {
    return <NoAccess title={`No access to ${mod}`} detail={`สิทธิ์ของ ${role} สำหรับโมดูล ${mod} ถูกตั้งเป็น "—" ใน Settings → Permissions — ติดต่อ CMO หากต้องการเข้าถึง`} />;
  }
  return <>{children}</>;
}

function NoAccess({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-surface border border-line rounded-cardLg p-10 max-w-md text-center">
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#F2F0EB" }}>
          <Lock size={20} className="text-faint" />
        </div>
        <div className="text-[16px] font-extrabold text-ink mb-2">{title}</div>
        <div className="text-[13px] text-muted leading-[1.6]">{detail}</div>
      </div>
    </div>
  );
}
