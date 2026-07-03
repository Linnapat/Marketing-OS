"use client";

/** Pill segmented toggle used for Month/Range and view switches. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-line3 rounded-[9px] p-[3px] flex-shrink-0">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="text-[13px] font-bold px-[14px] py-[6px] rounded-[7px] whitespace-nowrap transition"
            style={{
              background: active ? "#fff" : "transparent",
              color: active ? "#211F1C" : "#9A9387",
              boxShadow: active ? "0 1px 4px rgba(0,0,0,.08)" : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
