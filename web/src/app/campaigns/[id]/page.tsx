import { CAMPAIGNS, getCampaign, deriveDetail } from "@/lib/data/campaigns";
import { CampaignDetailClient } from "@/components/campaign/CampaignDetailClient";

export function generateStaticParams() {
  return CAMPAIGNS.map((c) => ({ id: c.id }));
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  // Seeded ids render from the mock immediately; ids created at runtime are
  // resolved from the database by the client loader.
  const campaign = getCampaign(params.id);
  const initialDetail = campaign ? deriveDetail(campaign) : null;
  return <CampaignDetailClient id={params.id} initialDetail={initialDetail} />;
}
