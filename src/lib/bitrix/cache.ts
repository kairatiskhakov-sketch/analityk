import { unstable_cache } from "next/cache";
import {
  BitrixAPI,
  type BitrixDeal,
  type BitrixLead,
  type BitrixManager,
  type BitrixPipeline,
} from "@/lib/bitrix/api";

/** Без unstable_cache — для план/факт (актуальные суммы). */
export async function fetchDealsUncached(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  managerIds?: string[],
  categoryId?: string,
): Promise<BitrixDeal[]> {
  const api = new BitrixAPI(webhookUrl);
  return api.getDeals({
    dateFrom,
    dateTo,
    managerIds: managerIds?.length ? managerIds : undefined,
    categoryId: categoryId || undefined,
  });
}

export async function fetchLeadsUncached(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  managerIds?: string[],
): Promise<BitrixLead[]> {
  const api = new BitrixAPI(webhookUrl);
  return api.getLeads({
    dateFrom,
    dateTo,
    managerIds: managerIds?.length ? managerIds : undefined,
  });
}

const REVALIDATE = 300;

/** Кеш 5 мин по webhook + период + фильтрам (явные keyParts). */
export async function fetchLeadsCached(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  managerIds?: string[],
): Promise<BitrixLead[]> {
  const mk = managerIds?.length ? [...managerIds].sort().join(",") : "";
  const run = unstable_cache(
    async () => {
      const api = new BitrixAPI(webhookUrl);
      return api.getLeads({
        dateFrom,
        dateTo,
        managerIds: mk ? mk.split(",") : undefined,
      });
    },
    ["bitrix-leads", webhookUrl, dateFrom, dateTo, mk],
    { revalidate: REVALIDATE },
  );
  return run();
}

export async function fetchDealsCached(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  managerIds?: string[],
  categoryId?: string,
): Promise<BitrixDeal[]> {
  const mk = managerIds?.length ? [...managerIds].sort().join(",") : "";
  const cat = categoryId ?? "";
  const run = unstable_cache(
    async () => {
      const api = new BitrixAPI(webhookUrl);
      return api.getDeals({
        dateFrom,
        dateTo,
        managerIds: mk ? mk.split(",") : undefined,
        categoryId: cat || undefined,
      });
    },
    ["bitrix-deals", webhookUrl, dateFrom, dateTo, mk, cat],
    { revalidate: REVALIDATE },
  );
  return run();
}

export async function fetchPipelinesCached(
  webhookUrl: string,
): Promise<BitrixPipeline[]> {
  const run = unstable_cache(
    async () => {
      const api = new BitrixAPI(webhookUrl);
      return api.getPipelines();
    },
    ["bitrix-pipelines", webhookUrl],
    { revalidate: REVALIDATE },
  );
  return run();
}

export async function fetchManagersCached(
  webhookUrl: string,
): Promise<BitrixManager[]> {
  const run = unstable_cache(
    async () => {
      const api = new BitrixAPI(webhookUrl);
      return api.getManagers();
    },
    ["bitrix-managers", webhookUrl],
    { revalidate: REVALIDATE },
  );
  return run();
}

export async function fetchLostReasonsCached(
  webhookUrl: string,
): Promise<Awaited<ReturnType<BitrixAPI["getLostReasons"]>>> {
  const run = unstable_cache(
    async () => {
      const api = new BitrixAPI(webhookUrl);
      return api.getLostReasons();
    },
    ["bitrix-lost-reasons", webhookUrl],
    { revalidate: REVALIDATE },
  );
  return run();
}

export async function fetchSourcesCatalogCached(
  webhookUrl: string,
): Promise<Awaited<ReturnType<BitrixAPI["getSources"]>>> {
  const run = unstable_cache(
    async () => {
      const api = new BitrixAPI(webhookUrl);
      return api.getSources();
    },
    ["bitrix-sources-cat", webhookUrl],
    { revalidate: REVALIDATE },
  );
  return run();
}
