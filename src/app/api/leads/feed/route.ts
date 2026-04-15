import { parseOpportunity } from "@/lib/bitrix/api";
import {
  fetchLeadsCached,
  fetchManagersCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapLeadStatus(statusId: string | undefined): string {
  const s = (statusId ?? "").toUpperCase();
  if (s === "CONVERTED") return "won";
  if (s === "JUNK") return "lost";
  if (s === "NEW") return "new";
  return "in_progress";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const managerIds = parseManagerIdsFromSearchParams(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ items: [], total: 0, page, limit });
    }

    const end = dateTo ? new Date(`${dateTo}T23:59:59`) : new Date();
    const start = dateFrom
      ? new Date(`${dateFrom}T00:00:00`)
      : new Date(end);
    if (!dateFrom) {
      start.setDate(end.getDate() - 30);
    }

    const [leads, managers, sources] = await Promise.all([
      fetchLeadsCached(url, ymd(start), ymd(end), managerIds),
      fetchManagersCached(url),
      fetchSourcesCatalogCached(url),
    ]);
    const mgrMap = new Map(managers.map((m) => [m.id, m.name]));
    const srcMap = new Map(sources.map((s) => [s.id, s.name]));

    let filtered = leads.map((l) => {
      const st = mapLeadStatus(l.STATUS_ID);
      const srcName =
        srcMap.get((l.SOURCE_ID ?? "").toString()) ??
        (l.SOURCE_ID ?? "").toString();
      return {
        id: l.ID ?? "",
        externalId: l.ID ?? "",
        name: (l.TITLE ?? "").trim() || "—",
        source: srcName,
        status: st,
        amount: parseOpportunity(l.OPPORTUNITY),
        failReason: (l.LOST_REASON_ID ?? "").toString(),
        createdAt: l.DATE_CREATE ?? l.CREATED_TIME ?? "",
        manager: {
          id: (l.ASSIGNED_BY_ID ?? "").toString(),
          name: mgrMap.get((l.ASSIGNED_BY_ID ?? "").toString()) ?? null,
        },
      };
    });

    if (status) {
      filtered = filtered.filter((x) => x.status === status);
    }
    if (source) {
      filtered = filtered.filter((x) =>
        x.source.toLowerCase().includes(source.toLowerCase()),
      );
    }

    const total = filtered.length;
    const skip = (page - 1) * limit;
    const items = filtered.slice(skip, skip + limit);

    return jsonOk({ items, total, page, limit });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
