"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ROLES, useRole } from "@/lib/role";

/** Role switcher — writes the app-wide "viewing as" role so role-based
 *  visibility (e.g. CMO-only P&L Operation costs) reflects the selection live. */
export function RoleSwitcher() {
  const { role, setRole, authRole, viewingAs } = useRole();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative px-2">
      {/* Said out loud while it is on: the screen is somebody else's, the
          account is still yours. */}
      {viewingAs && (
        <div className="mb-[6px] rounded-[10px] px-3 py-[7px] text-[11px] leading-[1.45]" style={{ background: "#FFF3D7", color: "#6B5310" }}>
          กำลังดูหน้าจอแบบ <b>{role}</b> — สิทธิ์จริงยังเป็น {authRole} และสิ่งที่กดจะบันทึกในชื่อคุณ
          <button onClick={() => setRole(authRole)} className="block mt-[3px] font-bold underline">↩ กลับเป็น {authRole}</button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-[9px] rounded-[10px] bg-white/[0.06] hover:bg-white/[0.09] text-[12px] font-semibold text-white/80 transition"
        style={viewingAs ? { boxShadow: "0 0 0 1.5px #E7B93C" } : undefined}
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
