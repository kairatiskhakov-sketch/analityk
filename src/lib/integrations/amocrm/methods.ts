import type { AmoHttpClient } from "./client";
import type { AmoLead, AmoPipeline, AmoUser } from "./types";

type EmbeddedList<T extends string, E> = {
  _embedded?: Record<T, E[]>;
};

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

/** GET /api/v4/leads/pipelines */
export async function amoListPipelines(
  client: AmoHttpClient,
): Promise<AmoPipeline[]> {
  const { data } = await client.get<EmbeddedList<"pipelines", AmoPipeline>>(
    "/leads/pipelines",
  );
  return data._embedded?.pipelines ?? [];
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
