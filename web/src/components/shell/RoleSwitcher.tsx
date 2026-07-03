"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ROLES, useRole } from "@/lib/role";

/** Role switcher — writes the app-wide "viewing as" role so role-based
 *  visibility (e.g. CMO-only P&L Operation costs) reflects the selection live. */
export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative px-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-[9px] rounded-[10px] bg-white/[0.06] hover:bg-white/[0.09] text-[12px] font-semibold text-white/80 transition"
      >
        <span className="truncate">Viewing as · {role}</span>
        <ChevronDown size={14} className="text-white/40 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-2 right-2 bg-panelAlt rounded-[10px] border border-white/10 py-1 z-20 shadow-xl">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => { setRole(r); setOpen(false); }}
              className="w-full text-left px-3 py-[7px] text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
