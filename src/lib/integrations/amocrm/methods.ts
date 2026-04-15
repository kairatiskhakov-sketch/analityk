import { createAmoClient, type AmoHttpClient } from "./client";
import type { AmoLead, AmoPipeline, AmoUser } from "./types";

type EmbeddedList<T extends string, E> = {
  _embedded?: Record<T, E[]>;
};

export const AMO_REQUEST_DELAY = 150;
export type AmoDateFilterMode = "created" | "closed";

function toUnixStart(dateYmd: string): number {
  return Math.floor(new Date(`${dateYmd}T00:00:00`).getTime() / 1000);
}

function toUnixEnd(dateYmd: string): number {
  return Math.floor(new Date(`${dateYmd}T23:59:59`).getTime() / 1000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /api/v4/leads?with=contacts,loss_reason&limit=&page=
 */
export async function amoListLeadsPage(
  client: AmoHttpClient,
  page: number,
  limit = 250,
): Promise<{ items: AmoLead[]; total: number }> {
  const { data, total } = await client.get<EmbeddedList<"leads", AmoLead>>(
    "/leads",
    {
      params: {
        with: "contacts,loss_reason",
        limit,
        page,
      },
    },
  );
  const items = data._embedded?.leads ?? [];
  return { items, total };
}

export async function amoFetchAllLeads(client: AmoHttpClient): Promise<AmoLead[]> {
  const out: AmoLead[] = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const { items, total } = await amoListLeadsPage(client, page, limit);
    out.push(...items);
    if (items.length === 0 || out.length >= total) break;
    page += 1;
  }
  return out;
}

export async function fetchAmoLeads(
  accessToken: string,
  subdomain: string,
  params: {
    dateFrom: string;
    dateTo: string;
    dateMode?: AmoDateFilterMode;
    pipelineId?: string;
    statusId?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ leads: AmoLead[]; total: number }> {
  const fromTs = toUnixStart(params.dateFrom);
  const toTs = toUnixEnd(params.dateTo);
  const client = createAmoClient(subdomain, accessToken);
  const page = params.page ?? 1;
  const limit = params.limit ?? 250;
  const dateMode = params.dateMode ?? "created";
  const fromKey =
    dateMode === "closed" ? "filter[closed_at][from]" : "filter[created_at][from]";
  const toKey =
    dateMode === "closed" ? "filter[closed_at][to]" : "filter[created_at][to]";
  const reqParams: Record<string, unknown> = {
    with: "loss_reason",
    limit,
    page,
    [fromKey]: fromTs,
    [toKey]: toTs,
  };
  if (params.pipelineId) {
    reqParams["filter[pipeline_id][]"] = params.pipelineId;
  }
  if (params.pipelineId && params.statusId) {
    reqParams["filter[statuses][0][pipeline_id]"] = params.pipelineId;
    reqParams["filter[statuses][0][status_id]"] = params.statusId;
  }
  const { data, total } = await client.get<EmbeddedList<"leads", AmoLead>>(
    "/leads",
    { params: reqParams },
  );
  return { leads: data._embedded?.leads ?? [], total };
}

export async function fetchAllAmoLeads(
  accessToken: string,
  subdomain: string,
  dateFrom: string,
  dateTo: string,
  dateMode: AmoDateFilterMode = "created",
  pipelineId?: string,
): Promise<AmoLead[]> {
  const allLeads: AmoLead[] = [];
  let page = 1;
  for (;;) {
    const { leads, total } = await fetchAmoLeads(accessToken, subdomain, {
      dateFrom,
      dateTo,
      dateMode,
      pipelineId,
      page,
      limit: 250,
    });
    allLeads.push(...leads);
    if (allLeads.length >= total || leads.length < 250) break;
    page += 1;
    await delay(AMO_REQUEST_DELAY);
  }
  return allLeads;
}

/** GET /api/v4/leads/pipelines */
export async function amoListPipelines(
  client: AmoHttpClient,
): Promise<AmoPipeline[]> {
  const { data } = await client.get<EmbeddedList<"pipelines", AmoPipeline>>(
    "/leads/pipelines",
    { params: { with: "statuses" } },
  );
  return data._embedded?.pipelines ?? [];
}

export async function fetchAmoPipelines(
  accessToken: string,
  subdomain: string,
): Promise<AmoPipeline[]> {
  const client = createAmoClient(subdomain, accessToken);
  return amoListPipelines(client);
}

/** GET /api/v4/leads/loss_reasons */
export async function amoListLossReasons(
  client: AmoHttpClient,
): Promise<{ id: number; name: string }[]> {
  const { data } = await client.get<
    EmbeddedList<"loss_reasons", { id: number; name: string }>
  >("/leads/loss_reasons");
  return data._embedded?.loss_reasons ?? [];
}

export async function fetchAmoLossReasons(
  accessToken: string,
  subdomain: string,
): Promise<{ id: number; name: string }[]> {
  const client = createAmoClient(subdomain, accessToken);
  return amoListLossReasons(client);
}

/** GET /api/v4/users */
export async function amoListUsersPage(
  client: AmoHttpClient,
  page: number,
  limit = 250,
): Promise<{ items: AmoUser[]; total: number }> {
  const { data, total } = await client.get<EmbeddedList<"users", AmoUser>>(
    "/users",
    { params: { limit, page } },
  );
  const items = data._embedded?.users ?? [];
  return { items, total };
}

export async function amoFetchAllUsers(client: AmoHttpClient): Promise<AmoUser[]> {
  const out: AmoUser[] = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const { items, total } = await amoListUsersPage(client, page, limit);
    out.push(...items);
    if (items.length === 0 || out.length >= total) break;
    page += 1;
  }
  return out;
}

/** GET /api/v4/contacts?with=leads&limit=&page= */
export async function amoListContactsPage(
  client: AmoHttpClient,
  page: number,
  limit = 250,
): Promise<{ items: unknown[]; total: number }> {
  const { data, total } = await client.get<EmbeddedList<"contacts", unknown>>(
    "/contacts",
    {
      params: {
        with: "leads",
        limit,
        page,
      },
    },
  );
  const items = data._embedded?.contacts ?? [];
  return { items, total };
}
