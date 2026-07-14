"use client";

import { ChevronDown } from "lucide-react";

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  allLabel = "All branches",
  placeholder = "Select branches…",
  emptyLabel = "No branches in Settings",
  className = "",
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const validSelected = selected.filter((item) => options.includes(item));
  const allSelected = options.length > 0 && validSelected.length === options.length;
  const summary = options.length === 0
    ? emptyLabel
    : allSelected
      ? allLabel
      : validSelected.length === 0
        ? placeholder
        : validSelected.length === 1
          ? validSelected[0]
          : `${validSelected.length} branches selected`;

  const toggle = (item: string) => {
    onChange(validSelected.includes(item)
      ? validSelected.filter((value) => value !== item)
      : [...validSelected, item]);
  };

  return (
    <details className={`relative group ${className}`}>
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none marker:content-none">
        <span className={validSelected.length ? "font-semibold text-ink truncate" : "text-faint truncate"}>{summary}</span>
        <ChevronDown size={16} className="shrink-0 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute z-40 mt-2 w-full min-w-[240px] max-h-[280px] overflow-y-auto rounded-[12px] border border-line2 bg-white p-2 shadow-xl">
        {options.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-faint">{emptyLabel}</div>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12.5px] font-bold cursor-pointer hover:bg-ivory">
              <input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [] : [...options])} />
              {allLabel}
            </label>
            <div className="my-1 border-t border-line4" />
            {options.map((item) => (
              <label key={item} className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12.5px] font-semibold cursor-pointer hover:bg-ivory">
                <input type="checkbox" checked={validSelected.includes(item)} onChange={() => toggle(item)} />
                {item}
              </label>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
