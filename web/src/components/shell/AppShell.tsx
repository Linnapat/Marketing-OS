"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarContent } from "./Sidebar";
import { RoleProvider } from "@/lib/role";
import { AuthProvider, useAuth, AUTH_REQUIRED } from "@/lib/auth";

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
        <div className="max-w-content mx-auto px-5 sm:px-6 pt-5 pb-16">{children}</div>
      </main>
    </div>
  );
}
