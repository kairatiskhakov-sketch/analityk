import {
  BITRIX_LOSS_REASON_FIELD,
  dealAnalyticsType,
  dealIsLost,
  dealIsWon,
  getStageConfigs,
  parseOpportunity,
} from "@/lib/bitrix/api";
import { resolveBitrixSourceLabel } from "@/lib/bitrix/bitrix-labels";
import {
  fetchDealUserfieldDictCached,
  fetchDealsCached,
  fetchManagersCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

function parseIds(raw: string | null) {
  return raw?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const status = searchParams.get("status")?.trim() || "";
    const source = searchParams.get("source")?.trim() || "";
    const managerId = searchParams.get("managerId")?.trim() || "";
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const managerIds = parseIds(searchParams.get("managerIds") ?? searchParams.get("managers"));
    const pipelineId = searchParams.get("pipelineId")?.trim() || undefined;
    const sortBy = (searchParams.get("sortBy")?.trim() || "createdAt") as
      | "title"
      | "source"
      | "manager"
      | "amount"
      | "statusType"
      | "createdAt"
      | "lostReason"
      | "daysInWork";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || "20")));
    if (!dateFrom || !dateTo) return jsonError("Укажите dateFrom и dateTo", 400);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) return jsonOk({ leads: [], total: 0, page, pages: 0 });

    const [wonStageIds, deals, managers, sourceCat, lossReasonUfDict, stageConfigs] = await Promise.all([
      getOrSyncWonStageIds(url),
      fetchDealsCached(url, dateFrom, dateTo, managerIds.length ? managerIds : undefined, pipelineId),
      fetchManagersCached(url),
      fetchSourcesCatalogCached(url),
      fetchDealUserfieldDictCached(url, BITRIX_LOSS_REASON_FIELD),
      getStageConfigs(),
    ]);
    const managerMap = new Map(managers.map((m) => [m.id, m.name]));
    const sourceMap = new Map(sourceCat.map((s) => [s.id, s.name]));

    const isWon = (d: typeof deals[number]) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds);
    const isLost = (d: typeof deals[number]) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "lost"
        : dealIsLost(d);

    const rows = deals.map((d) => {
      const createdRaw = String(d.DATE_CREATE ?? "");
      const createdTs = Date.parse(createdRaw);
      const daysInWork = Number.isFinite(createdTs)
        ? Math.max(0, Math.floor((Date.now() - createdTs) / 86400000))
        : 0;
      const statusType = isWon(d)
        ? "won"
        : isLost(d)
          ? "lost"
          : daysInWork === 0
            ? "new"
            : "progress";
      const sourceRaw = String(d.SOURCE_ID ?? "").trim();
      const sourceLabel = sourceRaw ? resolveBitrixSourceLabel(d.SOURCE_ID, sourceMap) : "—";
      const uf = String(
        (d as unknown as Record<string, unknown>)[BITRIX_LOSS_REASON_FIELD] ?? "",
      ).trim();
      let lostReason: string | null = null;
      if (isLost(d)) {
        if (uf && uf !== "0") {
          lostReason = lossReasonUfDict.get(uf) ?? `Причина ${uf}`;
        } else {
          const lr = String(d.LOSS_REASON_ID ?? "").trim();
          lostReason = lr ? `Причина ${lr}` : null;
        }
      }
      return {
        id: String(d.ID ?? ""),
        title: String(d.TITLE ?? `Сделка ${d.ID ?? ""}`),
        sourceId: sourceRaw,
        source: sourceLabel,
        managerId: String(d.ASSIGNED_BY_ID ?? ""),
        manager: managerMap.get(String(d.ASSIGNED_BY_ID ?? "")) ?? String(d.ASSIGNED_BY_ID ?? "—"),
        amount: parseOpportunity(d.OPPORTUNITY),
        statusId: String(d.STAGE_ID ?? ""),
        statusType,
        createdAt: createdRaw,
        lostReason,
        daysInWork,
      };
    });

    const filtered = rows.filter((l) => {
      if (managerId && l.managerId !== managerId) return false;
      if (source && l.source !== source && l.sourceId !== source) return false;
      if (status && l.statusType !== status) return false;
      if (search && !l.title.toLowerCase().includes(search)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""), "ru")
        : String(bv ?? "").localeCompare(String(av ?? ""), "ru");
    });

    const total = filtered.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const slice = filtered.slice(offset, offset + limit);

    return jsonOk({ leads: slice, total, page, pages });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Error", 500);
  }
}
