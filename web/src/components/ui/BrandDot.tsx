import { BrandId, brandColor, brandName } from "@/lib/brands";

export function BrandDot({ brand, size = 8 }: { brand: BrandId; size?: number }) {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: brandColor(brand) }}
    />
  );
}

export function BrandLabel({ brand, className }: { brand: BrandId; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[6px] ${className ?? ""}`}>
      <BrandDot brand={brand} />
      <span className="text-[12px] text-muted">{brandName(brand)}</span>
    </span>
  );
}
