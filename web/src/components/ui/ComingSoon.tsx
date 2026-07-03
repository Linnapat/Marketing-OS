import { PageHeader } from "./PageHeader";

/** Placeholder for modules whose designs exist but aren't built in this first pass.
 *  Keeps the whole nav clickable without pretending the screen is done. */
export function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <>
      <PageHeader eyebrow="Marketing OS" title={title} />
      <div className="mt-6 rounded-cardLg border border-dashed border-line2 bg-surface/60 p-12 text-center">
        <div className="text-[15px] font-bold text-ink">Design ready — implementation queued</div>
        <div className="text-[13px] text-faint mt-2 max-w-md mx-auto leading-relaxed">
          {note ??
            `The ${title} module is fully designed in the handoff bundle. This first build focuses on Dashboard, Campaigns, and Finance; this screen is next in line.`}
        </div>
      </div>
    </>
  );
}
