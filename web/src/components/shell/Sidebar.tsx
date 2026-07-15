"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut, Pencil, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { clsx } from "@/lib/clsx";
import { RoleSwitcher } from "./RoleSwitcher";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { moduleForPath } from "@/lib/permissions";
import { MEMBER_PRESENCE_OPTIONS } from "@/lib/data/settings";
import { saveMemberProfile } from "@/lib/db/settings";

const initials = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();
const NAV_ACCENTS: Record<string, { bg: string; fg: string }> = {
  "/": { bg: "#EEE9FF", fg: "#6C5CE7" },
  "/campaigns": { bg: "#EEE9FF", fg: "#6C5CE7" },
  "/platforms": { bg: "#E3F7F5", fg: "#0EA5A0" },
  "/content": { bg: "#F0F8D8", fg: "#5D9E35" },
  "/graphic": { bg: "#FDEBF3", fg: "#D876AA" },
  "/kol": { bg: "#FFF3E5", fg: "#E08A34" },
  "/ads": { bg: "#EDF8FE", fg: "#3FA7D6" },
  "/requests": { bg: "#FFF7E8", fg: "#D89C28" },
  "/approvals": { bg: "#FFF3D7", fg: "#B78E2D" },
  "/assets": { bg: "#F1ECFF", fg: "#8A62D7" },
  "/expenses": { bg: "#EAF8EE", fg: "#4BA06B" },
  "/finance": { bg: "#FFF3D7", fg: "#B78E2D" },
  "/my-tasks": { bg: "#FFF0F0", fg: "#E15B5B" },
  "/team": { bg: "#EAF1FF", fg: "#5A7CFF" },
  "/workflow": { bg: "#EAF1FF", fg: "#5A7CFF" },
  "/settings": { bg: "#F4F2F8", fg: "#706A84" },
  "/agency": { bg: "#F4F2F8", fg: "#706A84" },
};

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover border border-white/10" />;
  return <div className="w-8 h-8 rounded-full bg-accent/90 flex items-center justify-center text-panel text-[12px] font-extrabold">{initials(name)}</div>;
}

export function SidebarContent({ onNavigate, collapsed = false, onToggleCollapse }: {
  onNavigate?: () => void;
  /** Icon-only rail (desktop). The mobile drawer always renders expanded. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { user, member, role, signOut } = useAuth();
  const { can } = useRole();
  const displayName = member?.name ?? user?.email ?? "Linnapat D.";
  // Signed-in user without a members row must NOT be labeled CMO — that
  // default is only for demo mode (no auth). Their real role lives in
  // Settings → Users & Roles.
  const displayRole = member?.role ?? (user ? "Member" : "CMO");
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [presence, setPresence] = useState("🟢 Available");
  const [statusNote, setStatusNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAvatarUrl(member?.avatarUrl ?? "");
    setPresence(member?.presence ?? "🟢 Available");
    setStatusNote(member?.statusNote ?? "");
  }, [member]);
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
    <div
      className={clsx("flex flex-col h-full text-white transition-[width] duration-200", collapsed ? "w-[78px]" : "w-[280px]")}
      style={{ background: "#17172A" }}
    >
      {/* Brand */}
      <div className={clsx("pt-6 pb-5 border-b border-white/[0.08]", collapsed ? "px-3" : "px-5")}>
        <div className={clsx("flex items-center gap-[10px]", collapsed && "flex-col gap-3")}>
          <div className="w-10 h-10 rounded-[14px] flex items-center justify-center font-extrabold text-[15px] shadow-[0_10px_24px_rgba(108,92,231,0.28)] shrink-0" style={{ background: "linear-gradient(135deg, #7C6CF6, #5B4FD8)", color: "#fff" }}>
            M
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-extrabold tracking-[-0.01em] leading-none">
                MKT Playground
              </div>
              <div className="text-[10.5px] text-white/45 mt-[3px]">
                TEPPEN Group
              </div>
            </div>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "ขยายเมนู" : "ย่อเมนูเหลือไอคอน"}
              className="text-white/40 hover:text-white p-[6px] rounded-[8px] hover:bg-white/[0.06] shrink-0"
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={clsx("flex-1 overflow-y-auto pb-4", collapsed ? "px-[14px]" : "px-3")}>
        {groups.map((group, gi) => (
          <div key={gi} className="mb-4">
            {group.label && !collapsed && (
              <div className="px-3 pt-3 pb-2 text-[10px] font-bold tracking-[0.12em] uppercase text-white/28">
                {group.label}
              </div>
            )}
            {group.label && collapsed && gi > 0 && (
              <div className="mx-auto my-3 h-px w-6 bg-white/[0.12]" />
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              const accent = NAV_ACCENTS[item.href] ?? NAV_ACCENTS["/"];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={clsx(
                    "group flex items-center rounded-[16px] mb-[4px] text-[13px] font-semibold transition min-w-0",
                    collapsed ? "justify-center px-0 py-[9px]" : "gap-3 px-3 py-[11px]",
                    active
                      ? "text-white"
                      : "text-white/70 hover:text-white hover:bg-white/[0.05]",
                  )}
                  style={active ? { background: "linear-gradient(135deg, #7C6CF6, #5B4FD8)", boxShadow: "0 12px 26px rgba(108, 92, 231, 0.28)" } : undefined}
                >
                  <span
                    className="w-8 h-8 rounded-[11px] flex items-center justify-center shrink-0"
                    style={active ? { background: "rgba(255,255,255,.16)", color: "#fff" } : { background: accent.bg, color: accent.fg }}
                  >
                    <Icon
                      size={16}
                      className={clsx(active ? "text-white" : "")}
                    />
                  </span>
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="text-[10.5px] font-bold px-[7px] py-[1px] rounded-pill bg-white/95 text-[#5B4FD8]">
                      {item.badge}
                    </span>
                  )}
                  {!collapsed && !item.ready && (
                    <span className="text-[9px] font-bold text-[#D7B76A] bg-white/[0.06] border border-white/[0.08] tracking-wide rounded-pill px-[6px] py-[2px]">SOON</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: role switcher + user */}
      <div className="px-3 pb-4 pt-3 border-t border-white/[0.08] bg-white/[0.02]">
        {/* Role preview is a demo aid — hide it once real logins are enforced,
            so a signed-in user can't escalate their "viewing as" role. */}
        {!AUTH_REQUIRED && !collapsed && <RoleSwitcher />}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 pt-1" title={`${displayName} · ${displayRole}`}>
            <Avatar name={displayName} avatarUrl={member?.avatarUrl} />
            {AUTH_REQUIRED && user && (
              <button onClick={() => signOut()} aria-label="Sign out" className="text-white/40 hover:text-white p-1" title="Sign out">
                <LogOut size={15} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-[10px] px-2 pt-2">
            <Avatar name={displayName} avatarUrl={member?.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-white/90 truncate">{displayName}</div>
              <div className="text-[10.5px] text-white/40 truncate">{displayRole}</div>
              {member?.presence && <div className="text-[10.5px] text-white/55 truncate">{member.presence}{member.statusNote ? ` · ${member.statusNote}` : ""}</div>}
            </div>
            {member && (
              <button onClick={() => setProfileOpen(true)} aria-label="Edit profile" className="text-white/40 hover:text-white p-1" title="Edit profile">
                <Pencil size={15} />
              </button>
            )}
            {AUTH_REQUIRED && user && (
              <button onClick={() => signOut()} aria-label="Sign out" className="text-white/40 hover:text-white p-1" title="Sign out">
                <LogOut size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {profileOpen && member && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setProfileOpen(false)} />
          <div className="relative w-full max-w-md rounded-[20px] border border-line bg-surface text-ink p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <div className="text-[17px] font-extrabold">Your profile</div>
                <div className="text-[12px] text-faint mt-1">{member.name}</div>
              </div>
              <button onClick={() => setProfileOpen(false)} className="text-faint hover:text-ink"><X size={18} /></button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Profile photo URL</label>
                <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Presence</label>
                <select value={presence} onChange={(e) => setPresence(e.target.value)} className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none">
                  {MEMBER_PRESENCE_OPTIONS.map((opt) => {
                    const value = `${opt.emoji} ${opt.label}`;
                    return <option key={value} value={value}>{value}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Fun status</label>
                <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} maxLength={60} placeholder="เช่น coffee mode / deep work / review marathon" className="w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveMemberProfile(member.email, { avatarUrl, presence, statusNote });
                    setProfileOpen(false);
                    window.location.reload();
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              <button onClick={() => setProfileOpen(false)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
