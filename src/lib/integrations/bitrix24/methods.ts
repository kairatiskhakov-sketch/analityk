import type { Bitrix24HttpClient } from "./client";
import type {
  BitrixDealRow,
  BitrixLeadRow,
  BitrixStatusRow,
  BitrixUserRow,
} from "./types";

type Client = Bitrix24HttpClient;

export async function bitrixLeadList(
  client: Client,
  params: {
    select?: string[];
    filter?: Record<string, unknown>;
    order?: Record<string, string>;
    start?: number;
  },
) {
  return client.call<BitrixLeadRow[]>("crm.lead.list", {
    select: params.select,
    filter: params.filter,
    order: params.order,
    start: params.start ?? 0,
  });
}

export async function bitrixDealList(
  client: Client,
  params: {
    select?: string[];
    filter?: Record<string, unknown>;
    order?: Record<string, string>;
    start?: number;
  },
) {
  return client.call<BitrixDealRow[]>("crm.deal.list", {
    select: params.select,
    filter: params.filter,
    order: params.order,
    start: params.start ?? 0,
  });
}

export async function bitrixDealCategoryList(client: Client) {
  return client.call<unknown[]>("crm.dealcategory.list", {});
}

export async function bitrixStatusListSource(client: Client) {
  return client.call<BitrixStatusRow[]>("crm.status.list", {
    filter: { ENTITY_ID: "SOURCE" },
  });
}

export async function bitrixStatusListLeadLostReason(client: Client) {
  return client.call<BitrixStatusRow[]>("crm.status.list", {
    filter: { ENTITY_ID: "LEAD_LOST_REASON" },
  });
}

export async function bitrixUserGet(
  client: Client,
  params?: { filter?: Record<string, unknown> },
) {
  return client.call<BitrixUserRow[]>("user.get", params ?? {});
}

export async function fetchAllLeads(
  client: Client,
  base: Omit<Parameters<typeof bitrixLeadList>[1], "start">,
): Promise<BitrixLeadRow[]> {
  const out: BitrixLeadRow[] = [];
  let start = 0;
  for (;;) {
    const res = await bitrixLeadList(client, { ...base, start });
    const batch = res.result ?? [];
    out.push(...batch);
    if (res.next === undefined || res.next === null) break;
    start = res.next;
  }
  return out;
}

export async function fetchAllDeals(
  client: Client,
  base: Omit<Parameters<typeof bitrixDealList>[1], "start">,
): Promise<BitrixDealRow[]> {
  const out: BitrixDealRow[] = [];
  let start = 0;
  for (;;) {
    const res = await bitrixDealList(client, { ...base, start });
    const batch = res.result ?? [];
    out.push(...batch);
    if (res.next === undefined || res.next === null) break;
    start = res.next;
  }
  return out;
}
