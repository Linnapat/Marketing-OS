"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { comboboxMatches } from "@/lib/data/optionSearch";

/* A type-to-search single-select field.
 *
 * Replaces the `<input list=…>` / `<datalist>` pairing the New Post modal used
 * for Campaign: datalist gives no visible list until the browser feels like it,
 * silently drops entries past its own cap, filters by prefix only in some
 * engines, and is unstyleable — so a campaign you knew existed looked like it
 * did not. Here the list is ours: always visible on focus, filtered on every
 * substring of every word, and keyboard-navigable. */

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel = "ไม่พบรายการที่ตรงกับที่พิมพ์",
  disabled,
  allowCustom = false,
  className = "",
  inputClassName = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none",
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  /** Keep free text that matches no option (default: revert to the last valid
   *  pick on blur, so the field can never hold a half-typed value). */
  allowCustom?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = `${useId()}-list`;

  // While closed the input mirrors the committed value; typing takes over only
  // once the list is open, so a re-render never overwrites what is being typed.
  const text = open ? query : value;
  const matches = useMemo(() => comboboxMatches(options, open ? query : ""), [options, open, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the visible window.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const start = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const close = () => {
    // Free text that matched nothing is discarded unless the caller opted in —
    // otherwise the field would look filled while holding an unusable value.
    if (allowCustom && query.trim()) onChange(query.trim());
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { start(); return; }
      if (!matches.length) return;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % matches.length : (i - 1 + matches.length) % matches.length));
      return;
    }
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (matches[active]) commit(matches[active]);
      else if (allowCustom && query.trim()) commit(query.trim());
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation(); // the drawer/modal also listens for Escape
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        id={id}
        value={text}
        disabled={disabled}
        onFocus={start}
        onClick={start}
        onBlur={close}
        onChange={(e) => { if (!open) start(); setQuery(e.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        className={`${inputClassName} pr-[34px] disabled:cursor-not-allowed disabled:opacity-60`}
      />
      <div className="absolute right-[10px] top-1/2 -translate-y-1/2 flex items-center gap-1">
        {!!value && !disabled && (
          // onMouseDown, not onClick: blur fires first and would close the list
          // before the click lands.
          <button type="button" aria-label="ล้างค่า" onMouseDown={(e) => { e.preventDefault(); commit(""); }} className="text-faint hover:text-ink">
            <X size={13} />
          </button>
        )}
        <ChevronDown size={15} className={`text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div ref={listRef} id={listId} role="listbox" className="absolute z-50 mt-1 w-full max-h-[240px] overflow-y-auto rounded-[12px] border border-line2 bg-white p-1 shadow-xl">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-faint">{emptyLabel}</div>
          ) : (
            matches.map((o, i) => (
              <button
                key={o}
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o === value}
                data-idx={i}
                onMouseDown={(e) => { e.preventDefault(); commit(o); }}
                onMouseEnter={() => setActive(i)}
                className="block w-full text-left rounded-[8px] px-3 py-[7px] text-[12.5px] font-semibold truncate"
                style={i === active ? { background: "#F2EEE3", color: "#211F1C" } : { color: "#4a443c" }}
                title={o}
              >
                {o === value ? `✓ ${o}` : o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
