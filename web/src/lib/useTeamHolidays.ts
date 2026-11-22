"use client";
import { useEffect, useState } from "react";
import { getAppSetting } from "@/lib/db/appSettings";
import { parseTeamHolidays, TEAM_HOLIDAYS_SETTING_KEY } from "@/lib/data/teamHolidays";

/** The team's days off, for anything that hands out a round date. Empty until
 *  loaded — the round then reads as the plain rule, which is the safe side. */
export function useTeamHolidays(): string[] {
  const [holidays, setHolidays] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    getAppSetting(TEAM_HOLIDAYS_SETTING_KEY)
      .then((v) => { if (alive) setHolidays(parseTeamHolidays(v)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return holidays;
}
