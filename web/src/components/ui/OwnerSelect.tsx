"use client";

import { useEffect, useState } from "react";
import { Member } from "@/lib/db/settings";
import { fetchMembers } from "@/lib/db/settings";

// One owner picker for the whole app. Pulls the Team Member master, shows only
// active members as "Name — Role", and can be scoped to a functional team so a
// Graphic task defaults to Creative, a KOL task to the KOL team, etc.

export type OwnerTeam = "all" | "Creative" | "Planner" | "KOL" | "Ads" | "CRM";

// Map a member's free-form role to a functional team for filtering / defaults.
export function memberTeam(role: string): OwnerTeam {
  const r = (role || "").toLowerCase();
  if (/creative leader|design|graphic|art|video|vdo|agency|external/.test(r)) return "Creative";
  if (/kol|influencer/.test(r)) return "KOL";
  if (/ads|performance|media|paid/.test(r)) return "Ads";
  if (/crm|line|loyalty/.test(r)) return "CRM";
  if (/content creator|content|marketing executive|marketing manager|planner|campaign|co-?ordinator|brand lead|bgl/.test(r)) return "Planner";
  return "Planner";
}

const isActive = (m: Member) => (m.status || "").toLowerCase() === "active";

// A tiny module-level cache so every dropdown on a page doesn't refetch.
let _cache: Member[] | null = null;

export function OwnerSelect({
  value, onChange, team = "all", roleMatch, placeholder = "Select owner", disabled, invalid, className,
}: {
  value: string;
  onChange: (name: string) => void;
  team?: OwnerTeam;
  /** Optional role-name filter (e.g. /cmo|admin/i for the CMO-only approver). */
  roleMatch?: RegExp;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [members, setMembers] = useState<Member[]>(_cache ?? []);

  useEffect(() => {
    if (_cache) { setMembers(_cache); return; }
    let alive = true;
    fetchMembers().then((m) => { _cache = m; if (alive) setMembers(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const active = members.filter(isActive);
  const scoped = active
    .filter((m) => team === "all" || memberTeam(m.role) === team)
    .filter((m) => !roleMatch || roleMatch.test(m.role));
  // Never hide a value that's already set even if it's out of the current scope.
  const list = value && !scoped.some((m) => m.name === value)
    ? [...scoped, ...active.filter((m) => m.name === value)]
    : scoped;

  const border = invalid ? "border-status-red" : "border-line2";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full text-[13.5px] px-[12px] py-[10px] rounded-[10px] border ${border} bg-ivory outline-none disabled:opacity-50 ${className ?? ""}`}>
      <option value="">{scoped.length ? placeholder : "No active members"}</option>
      {list.map((m) => (
        <option key={m.email || m.name} value={m.name}>{m.name} — {m.role}</option>
      ))}
    </select>
  );
}

/** Pick a sensible default owner name for a team from the master list (client-safe). */
export function useDefaultOwner(team: OwnerTeam): string {
  const [name, setName] = useState("");
  useEffect(() => {
    const pick = (ms: Member[]) => {
      const active = ms.filter(isActive);
      const m = active.find((x) => memberTeam(x.role) === team) ?? active[0];
      if (m) setName(m.name);
    };
    if (_cache) pick(_cache);
    else fetchMembers().then((m) => { _cache = m; pick(m); }).catch(() => {});
  }, [team]);
  return name;
}
