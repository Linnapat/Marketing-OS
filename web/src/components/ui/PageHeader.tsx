export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-[10px] mb-[6px]">
      <div>
        {eyebrow && (
          <div className="text-[12px] text-faint font-semibold tracking-[0.06em] uppercase">
            {eyebrow}
          </div>
        )}
        <div className="text-[23px] font-extrabold letter-tightest mt-[3px]">{title}</div>
        {subtitle && <div className="text-[13px] text-faint mt-[3px]">{subtitle}</div>}
      </div>
      {right && <div className="text-[13px] text-muted">{right}</div>}
    </div>
  );
}
