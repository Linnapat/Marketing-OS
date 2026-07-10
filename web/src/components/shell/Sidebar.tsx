"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Pencil, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { clsx } from "@/lib/clsx";
import { RoleSwitcher } from "./RoleSwitcher";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { moduleForPath } from "@/lib/permissions";
import { MEMBER_PRESENCE_OPTIONS } from "@/lib/data/settings";
import { saveMemberProfile } from "@/lib/db/settings";

const initials = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover border border-white/10" />;
  return <div className="w-8 h-8 rounded-full bg-accent/90 flex items-center justify-center text-panel text-[12px] font-extrabold">{initials(name)}</div>;
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, member, role, signOut } = useAuth();
  const { can } = useRole();
  const displayName = member?.name ?? user?.email ?? "Linnapat D.";
  const displayRole = member?.role ?? "CMO";
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
