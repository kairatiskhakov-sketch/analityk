import { fetchLeadsCached, fetchManagersCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { leadIsLost, leadIsWon } from "@/lib/bitrix/api";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

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

    const [leads, managers, sourceRows, failRows] = await Promise.all([
      fetchLeadsCached(url, dateFrom, dateTo, managerIds.length ? managerIds : undefined),
      fetchManagersCached(url),
      prisma.crmDictionary.findMany({ where: { crmType: "bitrix24", entityId: "SOURCE" } }),
      prisma.crmDictionary.findMany({ where: { crmType: "bitrix24", entityId: "LEAD_LOST_REASON" } }),
    ]);
    const managerMap = new Map(managers.map((m) => [m.id, m.name]));
    const sourceMap = new Map(sourceRows.map((r) => [r.externalId, r.name]));
    const failMap = new Map(failRows.map((r) => [r.externalId, r.name]));

    const rows = leads.map((l) => {
      const createdRaw = String((l as { CREATED_TIME?: string }).CREATED_TIME ?? l.DATE_CREATE ?? "");
      const createdTs = Date.parse(createdRaw);
      const daysInWork = Number.isFinite(createdTs) ? Math.max(0, Math.floor((Date.now() - createdTs) / 86400000)) : 0;
      const statusType = leadIsWon(l) ? "won" : leadIsLost(l) ? "lost" : String(l.STATUS_ID ?? "").toUpperCase() === "NEW" ? "new" : "progress";
      return {
        id: String(l.ID ?? ""),
        title: String(l.TITLE ?? `Лид ${l.ID ?? ""}`),
        sourceId: String(l.SOURCE_ID ?? ""),
        source: sourceMap.get(String(l.SOURCE_ID ?? "")) ?? String(l.SOURCE_ID ?? "—"),
        managerId: String(l.ASSIGNED_BY_ID ?? ""),
        manager: managerMap.get(String(l.ASSIGNED_BY_ID ?? "")) ?? String(l.ASSIGNED_BY_ID ?? "—"),
        amount: Number(l.OPPORTUNITY ?? 0),
        statusId: String(l.STATUS_ID ?? ""),
        statusType,
        createdAt: createdRaw,
        lostReason: failMap.get(String(l.LOST_REASON_ID ?? "")) ?? null,
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
