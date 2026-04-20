import axios, { type AxiosInstance } from "axios";
import type { BitrixRestResponse } from "@/lib/integrations/bitrix24/types";

/** Поля лида из crm.lead.list */
export type BitrixLead = {
  ID?: string;
  TITLE?: string;
  STATUS_ID?: string;
  STATUS_SEMANTIC_ID?: "S" | "F" | "P" | string;
  SOURCE_ID?: string;
  ASSIGNED_BY_ID?: string;
  OPPORTUNITY?: string;
  DATE_CREATE?: string;
  DATE_CLOSED?: string;
  CREATED_TIME?: string;
  CLOSED_TIME?: string;
  LOST_REASON_ID?: string;
  UTM_SOURCE?: string;
  UTM_MEDIUM?: string;
  UTM_CAMPAIGN?: string;
  ADDRESS_CITY?: string;
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
  SOURCE_ID?: string;
  LOSS_REASON_ID?: string;
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
  color?: string;
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
  "STATUS_SEMANTIC_ID",
  "OPPORTUNITY",
  "DATE_CREATE",
  "DATE_CLOSED",
  "CREATED_TIME",
  "CLOSED_TIME",
  "LOST_REASON_ID",
  "UTM_SOURCE",
  "UTM_MEDIUM",
  "UTM_CAMPAIGN",
  "ADDRESS_CITY",
  "CATEGORY_ID",
] as const;

/**
 * UF-поле сделки, которое хранит причину отказа (enumeration).
 * Портал higroup.bitrix24.kz использует UF_CRM_1679040517519.
 * Задаётся через env BITRIX_LOSS_REASON_FIELD для других порталов.
 */
export const BITRIX_LOSS_REASON_FIELD =
  process.env.BITRIX_LOSS_REASON_FIELD?.trim() || "UF_CRM_1679040517519";

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
  "SOURCE_ID",
  "LOSS_REASON_ID",
  BITRIX_LOSS_REASON_FIELD,
];

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

  /**
   * Batch-запрос: до 50 методов за один HTTP-вызов.
   * Возвращает результаты в том же порядке, что и входной массив.
   * https://apidocs.bitrix24.ru/api-reference/common/batch.html
   */
  async batch<T = unknown>(
    calls: { method: string; params?: Record<string, unknown> }[],
  ): Promise<(T | null)[]> {
    if (calls.length === 0) return [];
    const cmds: Record<string, string> = {};
    const cmdParams: Record<string, Record<string, unknown>> = {};
    calls.forEach((c, i) => {
      cmds[`cmd${i}`] = c.method;
      if (c.params && Object.keys(c.params).length > 0) {
        cmdParams[`cmd${i}`] = c.params;
      }
    });
    const res = await this.call<{ result: Record<string, T>; result_error: Record<string, string> }>(
      "batch",
      { cmd: cmds, ...Object.fromEntries(Object.entries(cmdParams).map(([k, v]) => [`params[${k}]`, v])) },
    );
    const resultMap = (res.result as unknown as { result: Record<string, T> })?.result ?? {};
    return calls.map((_, i) => resultMap[`cmd${i}`] ?? null);
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
    dateField?: "DATE_CREATE" | "DATE_CLOSED";
    statusSemanticId?: "S" | "F" | "P";
  }): Promise<BitrixLead[]> {
    const select = params.select ?? [...DEFAULT_LEAD_SELECT];
    const dateField = params.dateField ?? "DATE_CREATE";
    const filter: Record<string, unknown> = {
      [`>=${dateField}`]: `${params.dateFrom}T00:00:00`,
      [`<=${dateField}`]: `${params.dateTo}T23:59:59`,
    };
    if (params.statusSemanticId) {
      filter.STATUS_SEMANTIC_ID = params.statusSemanticId;
    }
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
      COLOR?: string;
      EXTRA?: { SEMANTICS?: string; COLOR?: string };
    }[],
  ): BitrixPipelineStage[] {
    return rows
      .map((row) => ({
        statusId: row.STATUS_ID ? String(row.STATUS_ID) : "",
        name: (row.NAME ?? "").trim() || String(row.STATUS_ID),
        sort: Number(row.SORT ?? 0),
        semantics: row.EXTRA?.SEMANTICS ?? row.SEMANTICS,
        color: row.COLOR ?? row.EXTRA?.COLOR,
      }))
      .filter((s) => s.statusId);
  }

  async getDeals(params: {
    dateFrom?: string;
    dateTo?: string;
    managerId?: string;
    managerIds?: string[];
    categoryId?: string;
    stageIds?: string[];
    ids?: string[];
    select?: string[];
    /** Поле даты для фильтра. Может быть стандартное (DATE_CREATE, CLOSEDATE)
     *  или UF-поле (UF_CRM_...). */
    dateField?: string;
  }): Promise<BitrixDeal[]> {
    const select = params.select ?? [...DEFAULT_DEAL_SELECT];
    const dateField = params.dateField ?? "DATE_CREATE";
    const baseFilter: Record<string, unknown> = {};
    if (params.dateFrom) {
      baseFilter[`>=${dateField}`] = `${params.dateFrom}T00:00:00`;
    }
    if (params.dateTo) {
      baseFilter[`<=${dateField}`] = `${params.dateTo}T23:59:59`;
    }
    if (params.categoryId !== undefined && params.categoryId !== "") {
      const cid = String(params.categoryId);
      // Основная воронка Bitrix24 — CATEGORY_ID = 0 (число)
      baseFilter.CATEGORY_ID = cid === "0" ? 0 : cid;
    }
    if (params.stageIds?.length) {
      baseFilter.STAGE_ID = params.stageIds;
    }
    if (params.managerIds?.length) {
      baseFilter.ASSIGNED_BY_ID = params.managerIds;
    } else if (params.managerId) {
      baseFilter.ASSIGNED_BY_ID = params.managerId;
    }

    // Если передан явный список ID — режем по 50 (URL/JSON safety) и
    // делаем по одному запросу на чанк.
    if (params.ids?.length) {
      const out: BitrixDeal[] = [];
      const chunkSize = 50;
      for (let i = 0; i < params.ids.length; i += chunkSize) {
        const chunk = params.ids.slice(i, i + chunkSize);
        const filter = { ...baseFilter, ID: chunk };
        const rows = await this.listAllPages<BitrixDeal>("crm.deal.list", {
          select,
          filter,
          order: { ID: "DESC" },
        });
        out.push(...rows);
      }
      return out;
    }

    return this.listAllPages<BitrixDeal>("crm.deal.list", {
      select,
      filter: baseFilter,
      order: { ID: "DESC" },
    });
  }

  /**
   * История переходов по стадиям. entityTypeId: 2 = сделка, 1 = лид.
   * Возвращает события "сделка попала в стадию X в момент CREATED_TIME".
   *
   * Внимание: crm.stagehistory.list возвращает result в форме { items: [...] },
   * в отличие от crm.deal.list (просто массив). Поэтому листаем вручную.
   *
   * Поддерживается фильтр по списку OWNER_ID (чанками по 50, чтобы не
   * упереться в лимит длины запроса).
   */
  async getStageHistoryEntries(params: {
    entityTypeId: number;
    dateFrom?: string;
    dateTo?: string;
    /** Жёсткое строгое неравенство `<CREATED_TIME` — для запроса событий ДО периода. */
    dateBefore?: string;
    stageIds?: string[];
    ownerIds?: string[];
  }): Promise<{ OWNER_ID: string; STAGE_ID: string; CREATED_TIME: string }[]> {
    const baseFilter: Record<string, unknown> = {};
    if (params.dateFrom) {
      baseFilter[">=CREATED_TIME"] = `${params.dateFrom}T00:00:00`;
    }
    if (params.dateTo) {
      baseFilter["<=CREATED_TIME"] = `${params.dateTo}T23:59:59`;
    }
    if (params.dateBefore) {
      baseFilter["<CREATED_TIME"] = `${params.dateBefore}T00:00:00`;
    }
    if (params.stageIds?.length) {
      baseFilter.STAGE_ID = params.stageIds;
    }

    type Entry = { OWNER_ID: string; STAGE_ID: string; CREATED_TIME: string };

    const fetchOnce = async (filter: Record<string, unknown>): Promise<Entry[]> => {
      const out: Entry[] = [];
      let start = 0;
      for (let page = 0; page < 200; page++) {
        const res = await this.call<{ items: Entry[] }>("crm.stagehistory.list", {
          entityTypeId: params.entityTypeId,
          select: ["OWNER_ID", "STAGE_ID", "CREATED_TIME"],
          filter,
          order: { CREATED_TIME: "DESC" },
          start,
        });
        const items = res.result?.items ?? [];
        out.push(...items);
        if (res.next === undefined || res.next === null) break;
        start = res.next;
      }
      return out;
    };

    if (params.ownerIds?.length) {
      const out: Entry[] = [];
      const chunkSize = 50;
      for (let i = 0; i < params.ownerIds.length; i += chunkSize) {
        const chunk = params.ownerIds.slice(i, i + chunkSize);
        out.push(...(await fetchOnce({ ...baseFilter, OWNER_ID: chunk })));
      }
      return out;
    }
    return fetchOnce(baseFilter);
  }

  /**
   * Выигранные стадии сделок по официальному SEMANTICS (success).
   */
  async getWonStageEntries(): Promise<{ id: string; name: string }[]> {
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
    };

    let mainRes = await this.call<
      { STATUS_ID?: string; NAME?: string; SEMANTICS?: string; EXTRA?: { SEMANTICS?: string } }[]
    >("crm.status.list", {
      filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: "0" },
    });
    let mainRows = mainRes.result ?? [];
    if (mainRows.length === 0) {
      mainRes = await this.call<{ STATUS_ID?: string; NAME?: string; SEMANTICS?: string; EXTRA?: { SEMANTICS?: string } }[]>(
        "crm.status.list",
        { filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: 0 } },
      );
      mainRows = mainRes.result ?? [];
    }
    if (mainRows.length === 0) {
      mainRes = await this.call<{ STATUS_ID?: string; NAME?: string; SEMANTICS?: string; EXTRA?: { SEMANTICS?: string } }[]>(
        "crm.status.list",
        { filter: { ENTITY_ID: "DEAL_STAGE" } },
      );
      mainRows = mainRes.result ?? [];
    }
    for (const stage of mainRows) {
      const semantics = (stage.EXTRA?.SEMANTICS ?? stage.SEMANTICS ?? "").toLowerCase();
      if (semantics === "success" || semantics === "s") {
        pushIf(stage.STATUS_ID, stage.NAME ?? "");
      }
    }

    const catRes = await this.call<
      { ID?: string | number; NAME?: string }[]
    >("crm.dealcategory.list", {});
    const rawCats = Array.isArray(catRes.result) ? catRes.result : [];
    const otherCats = rawCats.filter((c) => String(c.ID ?? "") !== "0" && c.ID != null);

    if (otherCats.length > 0) {
      type StageRow = { STATUS_ID?: string; NAME?: string; SEMANTICS?: string; EXTRA?: { SEMANTICS?: string } };
      const batchCalls = otherCats.map((cat) => ({
        method: "crm.status.list",
        params: { filter: { ENTITY_ID: `DEAL_STAGE_${String(cat.ID)}` } },
      }));
      const batchResults = await this.batch<StageRow[]>(batchCalls);
      for (let i = 0; i < otherCats.length; i++) {
        const cat = otherCats[i];
        const pid = String(cat.ID);
        const plName = (cat.NAME && String(cat.NAME).trim()) || pid;
        const rows = batchResults[i] ?? [];
        for (const stage of rows) {
          const semantics = (stage.EXTRA?.SEMANTICS ?? stage.SEMANTICS ?? "").toLowerCase();
          if (semantics === "success" || semantics === "s") {
            pushIf(stage.STATUS_ID, stage.NAME ?? "", plName);
          }
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

  /**
   * Словарь значений UF-поля сделки (enumeration).
   * Возвращает Map<id, label>.
   */
  async getDealUserfieldDict(fieldName: string): Promise<Map<string, string>> {
    const res = await this.call<
      { FIELD_NAME?: string; LIST?: { ID?: string | number; VALUE?: string }[] }[]
    >("crm.deal.userfield.list", { filter: { FIELD_NAME: fieldName } });
    const field = (res.result ?? []).find((f) => f.FIELD_NAME === fieldName);
    const out = new Map<string, string>();
    for (const item of field?.LIST ?? []) {
      if (item.ID == null) continue;
      out.set(String(item.ID), String(item.VALUE ?? "").trim() || String(item.ID));
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
        COLOR?: string;
        EXTRA?: { SEMANTICS?: string; COLOR?: string };
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
          COLOR?: string;
          EXTRA?: { SEMANTICS?: string; COLOR?: string };
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
      let stRes = await this.call<
        {
          STATUS_ID?: string;
          NAME?: string;
          SORT?: string | number;
          SEMANTICS?: string;
          COLOR?: string;
          EXTRA?: { SEMANTICS?: string; COLOR?: string };
        }[]
      >("crm.status.list", {
        filter: { ENTITY_ID: `DEAL_STAGE_${id}` },
      });
      let rows = stRes.result ?? [];
      if (rows.length === 0) {
        stRes = await this.call<
          {
            STATUS_ID?: string;
            NAME?: string;
            SORT?: string | number;
            SEMANTICS?: string;
            COLOR?: string;
            EXTRA?: { SEMANTICS?: string; COLOR?: string };
          }[]
        >("crm.status.list", {
          filter: { ENTITY_ID: "DEAL_STAGE", CATEGORY_ID: id },
        });
        rows = stRes.result ?? [];
      }
      const stages = this.mapDealStageRows(rows).sort(
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
  return String(l.STATUS_SEMANTIC_ID ?? "").toUpperCase() === "S";
}

export function leadIsLost(l: BitrixLead): boolean {
  const semantic = String(l.STATUS_SEMANTIC_ID ?? "").toUpperCase();
  const status = String(l.STATUS_ID ?? "").toUpperCase();
  if (semantic === "F") return true;
  if (status === "JUNK") return true;
  if (status.includes("JUNK")) return true;
  return false;
}

export function leadInProgress(l: BitrixLead): boolean {
  const semantic = String(l.STATUS_SEMANTIC_ID ?? "").toUpperCase();
  return semantic === "P" || !semantic;
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
