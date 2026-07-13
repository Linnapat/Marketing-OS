import { BrandId } from "@/lib/brands";
import { getAppSetting, setAppSetting } from "@/lib/db/appSettings";

export interface MetaBrandAccount {
  brand: BrandId;
  facebookPageId: string;
  facebookPageName: string;
  instagramBusinessId: string;
  instagramHandle: string;
}

const KEY = "meta_publishing_accounts";

export async function fetchMetaPublishingAccounts(): Promise<Record<BrandId, MetaBrandAccount>> {
  const raw = await getAppSetting(KEY);
  if (!raw) return {} as Record<BrandId, MetaBrandAccount>;
  try {
    return JSON.parse(raw) as Record<BrandId, MetaBrandAccount>;
  } catch {
    return {} as Record<BrandId, MetaBrandAccount>;
  }
}

export async function saveMetaPublishingAccounts(accounts: Record<BrandId, MetaBrandAccount>): Promise<void> {
  await setAppSetting(KEY, JSON.stringify(accounts));
}

export function hasMetaAccount(account?: MetaBrandAccount): boolean {
  return Boolean(account?.facebookPageId || account?.instagramBusinessId);
}
