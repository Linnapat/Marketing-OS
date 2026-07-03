import { barWidth } from "@/lib/format";

export function Progress({
  value,
  color = "#B8945A",
  track = "#F0EBE0",
  height = 5,
}: {
  value: number; // 0–100
  color?: string;
  track?: string;
  height?: number;
}) {
  return (
    <div
      className="rounded-[3px] overflow-hidden"
      style={{ height, background: track }}
    >
      <div
        className="h-full rounded-[3px]"
        style={{ width: barWidth(value), background: color }}
      />
    </div>
  );
}
