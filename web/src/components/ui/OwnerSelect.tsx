"use client";

import { useEffect, useState } from "react";
import { Member } from "@/lib/db/settings";
import { fetchJsonSetting, fetchMembers } from "@/lib/db/settings";
import { TEAMS_DATA } from "@/lib/data/settings";

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
type TeamCfg = { icon: string; name: string; lead: string; scope: string; members: string[] };

function memberToken(m: Member): string {
  return (m.email || m.name).toLowerCase();
}

function memberMatchesToken(m: Member, token: string): boolean {
  const t = token.toLowerCase().trim();
  return memberToken(m) === t || m.name.toLowerCase() === t;
}

function teamPattern(team: OwnerTeam): RegExp | null {
  if (team === "Creative") return /creative|agency|external/i;
  if (team === "KOL") return /kol|creator|influ/i;
  if (team === "Ads") return /ads|performance|media|paid/i;
  if (team === "CRM") return /crm|line|loyalty/i;
  if (team === "Planner") return /marketing|planner|campaign|operation|co-?ordination|coordination|bgl/i;
  return null;
}

function teamMembers(team: OwnerTeam, members: Member[], teams: TeamCfg[]): Member[] {
  const pattern = teamPattern(team);
  if (team === "all" || !pattern) return [];
  const cfg = teams.find((t) => pattern.test(`${t.name} ${t.scope}`));
  if (!cfg) return [];
  const tokens = [cfg.lead, ...(cfg.members ?? [])].filter(Boolean);
  const seen = new Set<string>();
  return tokens
    .map((token) => members.find((m) => memberMatchesToken(m, token)))
    .filter((m): m is Member => !!m && isActive(m))
    .filter((m) => {
      const key = memberToken(m);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// A tiny module-level cache so every dropdown on a page doesn't refetch.
let _cache: Member[] | null = null;
let _teamCache: TeamCfg[] | null = null;

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
  const [teams, setTeams] = useState<TeamCfg[]>(_teamCache ?? []);

  useEffect(() => {
    if (_cache && _teamCache) { setMembers(_cache); setTeams(_teamCache); return; }
    let alive = true;
    Promise.all([
      _cache ? Promise.resolve(_cache) : fetchMembers(),
      _teamCache ? Promise.resolve(_teamCache) : fetchJsonSetting<TeamCfg[]>("teams_config").then((t) => t ?? (TEAMS_DATA as TeamCfg[])),
    ]).then(([m, t]) => {
      _cache = m;
      _teamCache = t;
      if (alive) { setMembers(m); setTeams(t); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const active = members.filter(isActive);
  const configured = teamMembers(team, active, teams);
  const fallback = active.filter((m) => team === "all" || memberTeam(m.role) === team);
  const scoped = (configured.length ? configured : fallback)
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
    const pick = (ms: Member[], ts: TeamCfg[]) => {
      const active = ms.filter(isActive);
      const configured = teamMembers(team, active, ts);
      const m = configured[0] ?? active.find((x) => memberTeam(x.role) === team) ?? active[0];
      if (m) setName(m.name);
    };
    if (_cache && _teamCache) pick(_cache, _teamCache);
    else Promise.all([
      _cache ? Promise.resolve(_cache) : fetchMembers(),
      _teamCache ? Promise.resolve(_teamCache) : fetchJsonSetting<TeamCfg[]>("teams_config").then((t) => t ?? (TEAMS_DATA as TeamCfg[])),
    ]).then(([m, t]) => { _cache = m; _teamCache = t; pick(m, t); }).catch(() => {});
  }, [team]);
  return name;
}
