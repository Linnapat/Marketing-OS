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
    <div className="flex gap-0.5 bg-[#F1EFF6] border border-line rounded-[11px] p-[2px] flex-shrink-0 soft-shadow">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="text-[11.5px] font-bold px-[10px] py-[5px] rounded-[9px] whitespace-nowrap transition"
            style={{
              background: active ? "linear-gradient(135deg, #7C6CF6, #5B4FD8)" : "transparent",
              color: active ? "#fff" : "#8A879A",
              boxShadow: active ? "0 8px 18px rgba(108,92,231,.22)" : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
