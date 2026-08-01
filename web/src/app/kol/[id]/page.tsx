import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { KolProfileCard } from "@/components/kol/KolProfileCard";

// Full-page KOL 360. Its own URL on purpose: the specialist opens several in
// separate tabs to compare, and the link can be pasted to Finance or the team.
export default function KolProfilePage({ params }: { params: { id: string } }) {
  return (
    <div className="px-5 py-5 md:px-8 md:py-6 max-w-[1000px]">
      <Link href="/kol?tab=database" className="inline-flex items-center gap-1 text-[12px] font-semibold text-faint hover:text-ink mb-4">
        <ChevronLeft size={14} /> KOL Library
      </Link>
      <KolProfileCard kolId={params.id} />
    </div>
  );
}
