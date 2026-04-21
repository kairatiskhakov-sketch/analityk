import { BitrixAPI, leadIsLost, leadIsWon } from "@/lib/bitrix/api";
import { getActiveBitrixConnection, getBitrixWebhookBaseUrl } from "@/lib/bitrix/connection";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { resolveOrgId } from "@/lib/org/context";

export const dynamic = "force-dynamic";

const BITRIX_SOURCES: Record<string, string> = {
  CALL: "Звонок",
  EMAIL: "Email",
  WEB: "Веб-сайт",
  ADVERTISING: "Реклама",
  PARTNER: "Партнёр",
  RECOMMENDATION: "Рекомендация",
  TRADE_SHOW: "Выставка",
  SELF: "Собственный",
  OTHER: "Другое",
  "": "Не указан",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);
    const managerIds = parseManagerIdsFromSearchParams(searchParams) ?? [];
    const pipelineId = searchParams.get("pipelineId") || "";

    const conn = await getActiveBitrixConnection();
    const webhookUrl = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!webhookUrl) {
      return jsonOk({ sources: [], error: null });
    }

    const orgId = await resolveOrgId();

    try {
      const api = new BitrixAPI(webhookUrl);
      const leads = await api.getLeads({
        dateFrom: ymd(start),
        dateTo: ymd(end),
        managerIds: managerIds.length ? managerIds : undefined,
      });

      // Справочник источников из БД
      const sourceRows = await prisma.crmDictionary.findMany({
        where: { orgId, crmType: "bitrix24", entityId: "SOURCE" },
      });
      const sourceMap: Record<string, string> = {};
      for (const s of sourceRows) sourceMap[s.externalId] = s.name;

      // Если пустой — загрузить из Bitrix
      if (Object.keys(sourceMap).length === 0) {
        const res = await fetch(`${webhookUrl}crm.status.list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { ENTITY_ID: "SOURCE" } }),
        });
        const data = (await res.json()) as { result?: { STATUS_ID?: string; NAME?: string }[] };
        for (const s of data.result || []) {
          const externalId = String(s.STATUS_ID || "");
          if (!externalId) continue;
          sourceMap[externalId] = s.NAME || externalId;
          await prisma.crmDictionary.upsert({
            where: {
              orgId_crmType_entityId_externalId: {
                orgId,
                crmType: "bitrix24",
                entityId: "SOURCE",
                externalId,
              },
            },
            create: {
              orgId,
              crmType: "bitrix24",
              entityId: "SOURCE",
              externalId,
              name: s.NAME || externalId,
            },
            update: { name: s.NAME || externalId },
          });
        }
      }

      const getSourceName = (sourceId: string) =>
        sourceId && sourceMap[sourceId]
          ? sourceMap[sourceId]
          : BITRIX_SOURCES[sourceId || ""] || sourceId || "Не указан";

      const scopedLeads = pipelineId
        ? leads.filter((l) => String((l as { CATEGORY_ID?: string }).CATEGORY_ID ?? "") === pipelineId)
        : leads;

      const grouped = new Map<
        string,
        { count: number; won: number; lost: number }
      >();

      for (const l of scopedLeads) {
        const sourceName = getSourceName(String(l.SOURCE_ID || ""));
        const cur = grouped.get(sourceName) ?? { count: 0, won: 0, lost: 0 };
        cur.count += 1;
        if (leadIsWon(l)) cur.won += 1;
        if (leadIsLost(l)) cur.lost += 1;
        grouped.set(sourceName, cur);
      }

      const sources = Array.from(grouped.entries())
        .map(([source, data]) => ({
          source,
          count: data.count,
          won: data.won,
          lost: data.lost,
          conv:
            data.count > 0
              ? Math.round((data.won / data.count) * 100)
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return jsonOk({ sources, error: null });
    } catch {
      return jsonOk({ sources: [], error: "CRM недоступна", data: null });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
