import { notFound } from "next/navigation";
import { CAMPAIGNS, getCampaign, deriveDetail } from "@/lib/data/campaigns";
import { CampaignDetailView } from "@/components/campaign/CampaignDetailView";

export function generateStaticParams() {
  return CAMPAIGNS.map((c) => ({ id: c.id }));
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaign = getCampaign(params.id);
  if (!campaign) notFound();
  const detail = deriveDetail(campaign);
  return <CampaignDetailView detail={detail} />;
}
