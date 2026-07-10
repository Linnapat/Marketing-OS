"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Lock } from "lucide-react";
import { SidebarContent } from "./Sidebar";
import { RoleProvider, useRole } from "@/lib/role";
import { AuthProvider, useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { moduleForPath } from "@/lib/permissions";

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

  return (
    <div className="min-h-screen bg-ivory">
      {/* Desktop sidebar (fixed) */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-panel text-white px-4 h-14">
        <button onClick={() => setDrawer(true)} aria-label="Open menu" className="p-1">
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] bg-accent flex items-center justify-center text-panel font-extrabold text-[13px]">
            M
          </div>
          <span className="text-[14px] font-extrabold">Marketing OS</span>
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
      <main className="lg:pl-[248px]">
        <div className="max-w-content mx-auto px-5 sm:px-6 pt-5 pb-16">
          <ModuleGate>{children}</ModuleGate>
        </div>
      </main>
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
