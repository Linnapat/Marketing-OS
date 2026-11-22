"use client";

// One read of the brief-round settings — the monthly switch, the rounds that
// were pushed back, and the team's days off — shared by every page that shows
// a round's deadline.
//
// They used to be read page by page, and only the Graphic page knew about an
// extension: the round was moved to 27 Nov there while Team Calendar, My Tasks
// and the deadline strip went on announcing 20 Nov as two days late. One hook,
// one cache, and a change made on the Graphic page reaches every mounted reader
// at once (notifyBriefRoundChanged) instead of after a reload.

import { useEffect, useState } from "react";
import { getAppSetting } from "@/lib/db/appSettings";
import {
  BRIEF_CUTOFF_SETTING_KEY, BRIEF_EXTENSION_SETTING_KEY, DEFAULT_BRIEF_CUTOFF_DAY,
  parseBriefExtensions, type BriefRoundSettings,
} from "@/lib/data/briefDeadline";
import { TEAM_HOLIDAYS_SETTING_KEY, parseTeamHolidays } from "@/lib/data/teamHolidays";

export const DEFAULT_BRIEF_ROUND_SETTINGS: BriefRoundSettings = { cutoffDay: DEFAULT_BRIEF_CUTOFF_DAY, extensions: {}, holidays: [] };

let _settings: BriefRoundSettings | null = null;
let _inflight: Promise<BriefRoundSettings> | null = null;
const listeners = new Set<(s: BriefRoundSettings) => void>();

async function load(): Promise<BriefRoundSettings> {
  if (_settings) return _settings;
  if (_inflight) return _inflight;
  _inflight = Promise.all([
    getAppSetting(BRIEF_CUTOFF_SETTING_KEY).catch(() => null),
    getAppSetting(BRIEF_EXTENSION_SETTING_KEY).catch(() => null),
    getAppSetting(TEAM_HOLIDAYS_SETTING_KEY).catch(() => null),
  ]).then(([cutoff, ext, hol]) => {
    _settings = {
      // Missing / blank = the default (on); "0" = off. Same reading the brief
      // form has always used.
      cutoffDay: cutoff !== null && cutoff !== "" ? Number(cutoff) || 0 : DEFAULT_BRIEF_CUTOFF_DAY,
      extensions: parseBriefExtensions(ext),
      holidays: parseTeamHolidays(hol),
    };
    return _settings;
  }).finally(() => { _inflight = null; });
  return _inflight;
}

/** Call after saving any of the three settings: every mounted reader re-reads. */
export function notifyBriefRoundChanged(): void {
  _settings = null;
  void load().then((s) => { for (const l of listeners) l(s); });
}

export function useBriefRound(): BriefRoundSettings & { ready: boolean } {
  const [settings, setSettings] = useState<BriefRoundSettings | null>(_settings);
  useEffect(() => {
    let alive = true;
    const on = (s: BriefRoundSettings) => { if (alive) setSettings(s); };
    listeners.add(on);
    void load().then(on);
    return () => { alive = false; listeners.delete(on); };
  }, []);
  return { ...(settings ?? DEFAULT_BRIEF_ROUND_SETTINGS), ready: !!settings };
}
