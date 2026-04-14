import axios, { type AxiosInstance } from "axios";
import type { BitrixRestResponse } from "@/lib/integrations/bitrix24/types";

/** Поля лида из crm.lead.list */
export type BitrixLead = {
  ID?: string;
  TITLE?: string;
  STATUS_ID?: string;
  SOURCE_ID?: string;
  ASSIGNED_BY_ID?: string;
  OPPORTUNITY?: string;
  DATE_CREATE?: string;
  CREATED_TIME?: string;
  CLOSED_TIME?: string;
  LOST_REASON_ID?: string;
  UTM_SOURCE?: string;
};

/** Поля сделки из crm.deal.list */
export type BitrixDeal = {
  ID?: string;
  TITLE?: string;
  OPPORTUNITY?: string;
  STAGE_ID?: string;
  STAGE_NAME?: string;
  CATEGORY_ID?: string;
  STAGE_SEMANTIC_ID?: string;
  ASSIGNED_BY_ID?: string;
  DATE_CREATE?: string;
  CLOSED?: string;
  CLOSEDATE?: string;
  PROBABILITY?: string | number;
};

export type BitrixManager = {
  id: string;
  name: string;
  email?: string;
};

export type BitrixPipelineStage = {
  statusId: string;
  name: string;
  sort: number;
  semantics?: string;
};

export type BitrixPipeline = {
  id: string;
  name: string;
  sort: number;
  stages: BitrixPipelineStage[];
};

export type BitrixLostReason = { id: string; name: string };
export type BitrixSource = { id: string; name: string };

const DEFAULT_LEAD_SELECT = [
  "ID",
  "TITLE",
  "SOURCE_ID",
  "ASSIGNED_BY_ID",
  "STATUS_ID",
  "OPPORTUNITY",
  "DATE_CREATE",
  "CREATED_TIME",
  "CLOSED_TIME",
  "LOST_REASON_ID",
  "UTM_SOURCE",
] as const;

const DEFAULT_DEAL_SELECT = [
  "ID",
  "TITLE",
  "OPPORTUNITY",
  "STAGE_ID",
  "STAGE_NAME",
  "CATEGORY_ID",
  "STAGE_SEMANTIC_ID",
  "ASSIGNED_BY_ID",
  "DATE_CREATE",
  "CLOSED",
  "PROBABILITY",
] as const;

/** Узкий select для плана/факта — меньше трафика и быстрее ответ Bitrix. */
export const PLAN_FACT_DEAL_SELECT = [
  "ID",
  "STAGE_ID",
  "OPPORTUNITY",
  "ASSIGNED_BY_ID",
  "CLOSEDATE",
  "CLOSED",
  "DATE_CREATE",
] as const;

/**
 * Клиент входящего вебхука Bitrix24: POST {method} с JSON-телом.
 * `webhookUrl` — полный base, например https://portal/rest/1/token/
 */
export class BitrixAPI {
  private readonly raw: AxiosInstance;

  constructor(webhookUrl: string) {
    const base = webhookUrl.trim().replace(/\/?$/, "/");
    this.raw = axios.create({
      baseURL: base,
      timeout: 120_000,
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s >= 200 && s < 300,
    });
  }

  private async call<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<BitrixRestResponse<T>> {
    const path = method.startsWith("/") ? method.slice(1) : method;
    const { data } = await this.raw.post<BitrixRestResponse<T>>(path, params);
    if (data.error) {
      const msg = [data.error, (data as { error_description?: string }).error_description]
        .filter(Boolean)
        .join(": ");
      throw new Error(`Bitrix24 API: ${msg}`);
    }
    return data;
  }

  /** Собрать все страницы по полю `next` */
  private async listAllPages<T>(
    method: string,
    baseParams: Record<string, unknown>,
  ): Promise<T[]> {
    const out: T[] = [];
    let start = 0;
    for (;;) {
      const res = await this.call<T[]>(method, { ...baseParams, start });
      const batch = res.result ?? [];
      out.push(...batch);
      if (res.next === undefined || res.next === null) break;
      start = res.next;
    }
    return out;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.call("profile", {});
      return true;
    } catch {
      return false;
    }
  }

  async getLeads(params: {
    dateFrom: string;
    dateTo: string;
    managerId?: string;
    managerIds?: string[];
    select?: string[];
  }): Promise<BitrixLead[]> {
    const select = params.select ?? [...DEFAULT_LEAD_SELECT];
    const filter: Record<string, unknown> = {
      ">=DATE_CREATE": `${params.dateFrom}T00:00:00`,
      "<=DATE_CREATE": `${params.dateTo}T23:59:59`,
    };
    if (params.managerIds?.length) {
      filter.ASSIGNED_BY_ID = params.managerIds;
    } else if (params.managerId) {
      filter.ASSIGNED_BY_ID = params.managerId;
    }
    return this.listAllPages<BitrixLead>("crm.lead.list", {
      select,
      filter,
      order: { DATE_CREATE: "DESC" },
    });
  }

  private mapDealStageRows(
    rows: {
      STATUS_ID?: string;
      NAME?: string;
      SORT?: string | number;
      SEMANTICS?: string;
    }[],
  ): BitrixPipelineStage[] {
    return rows
      .map((row) => ({
        statusId: row.STATUS_ID ? String(row.STATUS_ID) : "",
        name: (row.NAME ?? "").trim() || String(row.STATUS_ID),
        sort: Number(row.SORT ?? 0),
        semantics: row.SEMANTICS,
      }))
      .filter((s) => s.statusId);
  }

  async getDeals(params: {
    dateFrom: string;
    dateTo: string;
    managerId?: string;
    managerIds?: string[];
    categoryId?: string;
    select?: string[];
  }): Promise<BitrixDeal[]> {
    const select = params.select ?? [...DEFAULT_DEAL_SELECT];
    const filter: Record<string, unknown> = {
      ">=DATE_CREATE": `${params.dateFrom}T00:00:00`,
      "<=DATE_CREATE": `${params.dateTo}T23:59:59`,
    };
    if (params.categoryId !== undefined && params.categoryId !== "") {
      const cid = String(params.categoryId);
      // Основная воронка Bitrix24 — CATEGORY_ID = 0 (число)
      filter.CATEGORY_ID = cid === "0" ? 0 : cid;
    }
    if (params.managerIds?.length) {
      filter.ASSIGNED_BY_ID = params.managerIds;
    } else if (params.managerId) {
      filter.ASSIGNED_BY_ID = params.managerId;
    }
    return this.listAllPages<BitrixDeal>("crm.deal.list", {
      select,
      filter,
      order: { DATE_CREATE: "DESC" },
    });
  }

  /**
   * Стадии сделок по ключевым словам (оплачен, выполнен, …) — для кеша WON_STAGE.
   */
  async getWonStageEntries(): Promise<{ id: string; name: string }[]> {
    const wonKeywords = [
      "оплачен",
      "выполнен",
      "сдан",
      "полная оплата",
      "оплата получена",
    ];
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];

    const pushIf = (
      sid: string | undefined,
      rawName: string,
      pipelineLabel?: string,
    ) => {
      if (!sid) return;
      const id = String(sid);
      if (seen.has(id)) return;
      seen.add(id);
      const name = pipelineLabel
        ? `${pipelineLabel} · ${rawName}`
        : rawName;
      out.push({ id, name });
      console.log("Won stage found:", pipelineLabel ?? "", id, rawName);
    };

    let mainRes = await this.call<
      { STATUS_ID?: string; NAME?: string }[]
    >("crm.status.list", {
      filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: "0" },
    });
    let mainRows = mainRes.result ?? [];
    if (mainRows.length === 0) {
      mainRes = await this.call<{ STATUS_ID?: string; NAME?: string }[]>(
        "crm.status.list",
        { filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: 0 } },
      );
      mainRows = mainRes.result ?? [];
    }
    if (mainRows.length === 0) {
      mainRes = await this.call<{ STATUS_ID?: string; NAME?: string }[]>(
        "crm.status.list",
        { filter: { ENTITY_ID: "DEAL_STAGE" } },
      );
      mainRows = mainRes.result ?? [];
    }
    for (const stage of mainRows) {
      const name = (stage.NAME ?? "").toLowerCase();
      if (wonKeywords.some((kw) => name.includes(kw))) {
        pushIf(stage.STATUS_ID, stage.NAME ?? "");
      }
    }

    const catRes = await this.call<
      { ID?: string | number; NAME?: string }[]
    >("crm.dealcategory.list", {});
    const rawCats = Array.isArray(catRes.result) ? catRes.result : [];
    for (const pipeline of rawCats) {
      const pid = pipeline.ID != null ? String(pipeline.ID) : "";
      if (!pid || pid === "0") continue;
      let stRes = await this.call<{ STATUS_ID?: string; NAME?: string }[]>(
        "crm.status.list",
        { filter: { ENTITY_ID: `DEAL_STAGE_${pid}` } },
      );
      let rows = stRes.result ?? [];
      if (rows.length === 0) {
        stRes = await this.call<{ STATUS_ID?: string; NAME?: string }[]>(
          "crm.status.list",
          { filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: pid } },
        );
        rows = stRes.result ?? [];
      }
      const plName =
        (pipeline.NAME && String(pipeline.NAME).trim()) || pid;
      for (const stage of rows) {
        const name = (stage.NAME ?? "").toLowerCase();
        if (wonKeywords.some((kw) => name.includes(kw))) {
          pushIf(stage.STATUS_ID, stage.NAME ?? "", plName);
        }
      }
    }

    return out;
  }

  async getManagers(): Promise<BitrixManager[]> {
    const rows = await this.listAllPages<{
      ID?: string;
      NAME?: string;
      LAST_NAME?: string;
      EMAIL?: string;
      ACTIVE?: boolean;
    }>("user.get", {
      filter: { ACTIVE: true },
    });
    const out: BitrixManager[] = [];
    for (const u of rows) {
      const id = u.ID != null ? String(u.ID) : "";
      if (!id) continue;
      const name =
        [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim() || "Пользователь";
      out.push({
        id,
        name,
        email: u.EMAIL ?? undefined,
      });
    }
    return out;
  }

  async getLostReasons(): Promise<BitrixLostReason[]> {
    const res = await this.call<
      { STATUS_ID?: string; NAME?: string }[]
    >("crm.status.list", {
      filter: { ENTITY_ID: "LEAD_LOST_REASON" },
    });
    return (res.result ?? [])
      .map((r) => ({
        id: r.STATUS_ID ? String(r.STATUS_ID) : "",
        name: String((r.NAME ?? "").trim() || r.STATUS_ID || ""),
      }))
      .filter((x) => x.id);
  }

  async getSources(): Promise<BitrixSource[]> {
    const res = await this.call<
      { STATUS_ID?: string; NAME?: string }[]
    >("crm.status.list", {
      filter: { ENTITY_ID: "SOURCE" },
    });
    return (res.result ?? [])
      .map((r) => ({
        id: r.STATUS_ID ? String(r.STATUS_ID) : "",
        name: String((r.NAME ?? "").trim() || r.STATUS_ID || ""),
      }))
      .filter((x) => x.id);
  }

  /**
   * Воронки сделок + стадии (crm.dealcategory.list + crm.status.list DEAL_STAGE).
   * Основная воронка (category 0) не всегда есть в crm.dealcategory.list — добавляем вручную.
   */
  async getPipelines(): Promise<BitrixPipeline[]> {
    const catRes = await this.call<
      { ID?: string | number; NAME?: string; SORT?: string | number }[]
    >("crm.dealcategory.list", {});

    const rawCats = Array.isArray(catRes.result) ? catRes.result : [];

    let categoryZero: { NAME?: string; SORT?: string | number } | null = null;
    try {
      const zRes = await this.call<{
        NAME?: string;
        SORT?: string | number;
        ID?: string | number;
      }>("crm.dealcategory.get", { id: 0 });
      const r = zRes.result;
      if (r && typeof r === "object" && !Array.isArray(r)) {
        categoryZero = r;
      }
    } catch {
      /* портал без доступа к get или старая версия API */
    }

    let mainStRes = await this.call<
      {
        STATUS_ID?: string;
        NAME?: string;
        SORT?: string | number;
        SEMANTICS?: string;
      }[]
    >("crm.status.list", {
      filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: "0" },
    });
    let mainRows = mainStRes.result ?? [];
    if (mainRows.length === 0) {
      mainStRes = await this.call<
        {
          STATUS_ID?: string;
          NAME?: string;
          SORT?: string | number;
          SEMANTICS?: string;
        }[]
      >("crm.status.list", {
        filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: 0 },
      });
      mainRows = mainStRes.result ?? [];
    }

    const mainStages = this.mapDealStageRows(mainRows).sort(
      (a, b) => a.sort - b.sort,
    );

    const mainFromList = rawCats.find((c) => String(c.ID ?? "") === "0");
    const mainName =
      (categoryZero?.NAME && String(categoryZero.NAME).trim()) ||
      (mainFromList?.NAME && String(mainFromList.NAME).trim()) ||
      "Квалификационная воронка";
    const mainSort = Number(categoryZero?.SORT ?? mainFromList?.SORT ?? 0);

    const mainPipeline: BitrixPipeline = {
      id: "0",
      name: mainName,
      sort: mainSort,
      stages: mainStages,
    };

    const out: BitrixPipeline[] = [mainPipeline];
    const others = rawCats.filter((c) => String(c.ID ?? "") !== "0");

    for (const cat of others) {
      const id = cat.ID != null ? String(cat.ID) : "";
      if (!id) continue;
      const stRes = await this.call<
        {
          STATUS_ID?: string;
          NAME?: string;
          SORT?: string | number;
          SEMANTICS?: string;
        }[]
      >("crm.status.list", {
        filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: id },
      });
      const stages = this.mapDealStageRows(stRes.result ?? []).sort(
        (a, b) => a.sort - b.sort,
      );
      out.push({
        id,
        name: (cat.NAME && String(cat.NAME).trim()) || `Воронка ${id}`,
        sort: Number(cat.SORT ?? 0),
        stages,
      });
    }

    return out.sort((a, b) => {
      if (a.id === "0") return -1;
      if (b.id === "0") return 1;
      return a.sort - b.sort;
    });
  }
}

export function parseOpportunity(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export {
  dealInProgressByStageName,
  dealIsLost,
  dealIsProgress,
  dealIsWon,
} from "./deal-predicates";

export function leadIsWon(l: BitrixLead): boolean {
  return (l.STATUS_ID ?? "").toUpperCase() === "CONVERTED";
}

export function leadIsLost(l: BitrixLead): boolean {
  const s = (l.STATUS_ID ?? "").toUpperCase();
  return (
    s === "JUNK" ||
    s === "LOSE" ||
    s.includes("FAIL") ||
    s.includes("JUNK")
  );
}

export {
  autoDetectStageType,
  countStageConfigs,
  dealAnalyticsType,
  dealIsLostByConfig,
  dealIsProgressByConfig,
  dealIsWonByConfig,
  getStageConfigs,
  type StageAnalyticsType,
} from "./stage-config";
