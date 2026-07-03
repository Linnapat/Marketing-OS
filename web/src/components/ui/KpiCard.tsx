import { Progress } from "./Progress";

export interface Kpi {
  label: string;
  value: string;
  meta?: string;
  /** progress 0–100 */
  bar?: number;
  barColor?: string;
  track?: string;
  footLeft?: string;
  footRight?: string;
  footLeftColor?: string;
  footRightColor?: string;
  dark?: boolean;
  cardBg?: string;
  cardBorder?: string;
  labelColor?: string;
  valColor?: string;
  metaColor?: string;
}

/** The dashboard/finance KPI tile. Supports the light/gold/green/dark variants in the designs. */
export function KpiCard(k: Kpi) {
  return (
    <div
      className="rounded-card p-4 border"
      style={{ background: k.cardBg ?? "#fff", borderColor: k.cardBorder ?? "#ECE6DA" }}
    >
      <div
        className="text-[10px] tracking-[0.07em] uppercase font-bold mb-2"
        style={{ color: k.labelColor ?? "#9A9387" }}
      >
        {k.label}
      </div>
      <div
        className="text-[24px] font-extrabold letter-tightest mb-1"
        style={{ color: k.valColor ?? "#211F1C" }}
      >
        {k.value}
      </div>
      {k.meta && (
        <div className="text-[11px] mb-2" style={{ color: k.metaColor ?? "#9A9387" }}>
          {k.meta}
        </div>
      )}
      {typeof k.bar === "number" && (
        <Progress value={k.bar} color={k.barColor ?? "#B8945A"} track={k.track ?? "#F0EBE0"} />
      )}
      {(k.footLeft || k.footRight) && (
        <div className="flex justify-between mt-[5px] text-[10.5px]">
          <span className="font-bold" style={{ color: k.footLeftColor ?? "#B8945A" }}>{k.footLeft}</span>
          <span className="font-semibold" style={{ color: k.footRightColor ?? "#9A9387" }}>{k.footRight}</span>
        </div>
      )}
    </div>
  );
}
