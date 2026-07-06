"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV } from "@/lib/nav";
import { clsx } from "@/lib/clsx";
import { RoleSwitcher } from "./RoleSwitcher";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { moduleForPath } from "@/lib/permissions";

const initials = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, member, role, signOut } = useAuth();
  const { can } = useRole();
  const displayName = member?.name ?? user?.email ?? "Linnapat D.";
  const displayRole = member?.role ?? "CMO / Admin";
  // External agency users only see their portal (demo role-switcher included).
  const baseGroups = role === "Agency (External)"
    ? NAV.filter((g) => g.label === "External")
    : NAV;
  // Every item is gated by the Settings Permissions matrix via its module —
  // same map the page gate uses, so nav and pages never disagree.
  const groups = baseGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => { const m = moduleForPath(it.href); return !m || can(m); }) }))
    .filter((g) => g.items.length > 0);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-panel text-white w-[248px]">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-[10px]">
          <div className="w-8 h-8 rounded-[9px] bg-accent flex items-center justify-center text-panel font-extrabold text-[15px]">
            M
          </div>
          <div>
            <div className="text-[14.5px] font-extrabold tracking-[-0.01em] leading-none">
              Marketing OS
            </div>
            <div className="text-[10.5px] text-[#9c948340] text-white/40 mt-[3px]">
              TEPPEN Group
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={gi} className="mb-3">
            {group.label && (
              <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.08em] uppercase text-white/30">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={clsx(
                    "group flex items-center gap-3 px-3 py-[9px] rounded-[10px] mb-[2px] text-[13.5px] font-semibold transition",
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-white/55 hover:text-white hover:bg-white/[0.04]",
                  )}
                >
                  <Icon
                    size={17}
                    className={clsx(active ? "text-accent" : "text-white/45 group-hover:text-white/70")}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10.5px] font-bold px-[7px] py-[1px] rounded-pill bg-accent text-panel">
                      {item.badge}
                    </span>
                  )}
                  {!item.ready && (
                    <span className="text-[9px] font-bold text-white/25 tracking-wide">SOON</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: role switcher + user */}
      <div className="px-3 pb-4 pt-2 border-t border-white/[0.07]">
        {/* Role preview is a demo aid — hide it once real logins are enforced,
            so a signed-in user can't escalate their "viewing as" role. */}
        {!AUTH_REQUIRED && <RoleSwitcher />}
        <div className="flex items-center gap-[10px] px-2 pt-3">
          <div className="w-8 h-8 rounded-full bg-accent/90 flex items-center justify-center text-panel text-[12px] font-extrabold">
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-white/90 truncate">{displayName}</div>
            <div className="text-[10.5px] text-white/40 truncate">{displayRole}</div>
          </div>
          {AUTH_REQUIRED && user && (
            <button onClick={() => signOut()} aria-label="Sign out" className="text-white/40 hover:text-white p-1" title="Sign out">
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
