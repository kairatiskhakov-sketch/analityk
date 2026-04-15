import {
  dealIsWon,
  parseOpportunity,
  type BitrixDeal,
} from "@/lib/bitrix/api";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { fetchDealsCached, fetchManagersCached } from "@/lib/bitrix/cache";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

type GroupBy = "day" | "week";
function parseGroupBy(v: string | null): GroupBy | null {
  if (v === "day" || v === "week") return v;
  return null;
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStartYmd(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return toYmd(x);
}

function buildBuckets(dateFrom: string, dateTo: string, groupBy: GroupBy) {
  const out: string[] = [];
  const cur = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  if (groupBy === "day") {
    while (cur <= end) {
      out.push(toYmd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }
  const seen = new Set<string>();
  while (cur <= end) {
    const w = weekStartYmd(cur);
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const groupBy = parseGroupBy(searchParams.get("groupBy"));
    const managerIdsRaw = searchParams.get("managers");
    const pipelineId = searchParams.get("pipelineId") ?? undefined;
    const stageIdsRaw = searchParams.get("stageIds");

    if (
      !dateFrom ||
      !dateTo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)
    ) {
      return jsonError("Укажите dateFrom и dateTo (YYYY-MM-DD)", 400);
    }
    if (!groupBy) {
      return jsonError("groupBy: day | week", 400);
    }

    const managerIds = managerIdsRaw
      ? managerIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const stageIds = new Set(
      stageIdsRaw
        ? stageIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    );

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({
        hasCrm: false,
        data: null,
        error: "Bitrix24 не подключён",
      });
    }

    const [wonStageIds, managers, deals] = await Promise.all([
      getOrSyncWonStageIds(url),
      fetchManagersCached(url),
      fetchDealsCached(url, dateFrom, dateTo, managerIds, pipelineId),
    ]);
    const managerName = new Map(managers.map((m) => [m.id, m.name]));
    const buckets = buildBuckets(dateFrom, dateTo, groupBy);
    const byManager = new Map<
      string,
      {
        managerId: string;
        name: string;
        data: { date: string; amount: number; deals: number }[];
      }
    >();
    const ensure = (mid: string) => {
      if (!byManager.has(mid)) {
        byManager.set(mid, {
          managerId: mid,
          name: managerName.get(mid) ?? mid,
          data: buckets.map((b) => ({ date: b, amount: 0, deals: 0 })),
        });
      }
      return byManager.get(mid)!;
    };
    const bucketIdx = new Map(buckets.map((b, i) => [b, i]));

    for (const d of deals) {
      if (!dealIsWon(d as BitrixDeal, wonStageIds)) continue;
      if (stageIds.size && !stageIds.has(String(d.STAGE_ID ?? ""))) continue;
      const mid = String(d.ASSIGNED_BY_ID ?? "");
      if (!mid) continue;
      const rawDate = String(d.DATE_CREATE ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue;
      const bucket = groupBy === "day" ? rawDate : weekStartYmd(new Date(`${rawDate}T00:00:00`));
      const idx = bucketIdx.get(bucket);
      if (idx == null) continue;
      const row = ensure(mid);
      row.data[idx].amount += parseOpportunity(d.OPPORTUNITY);
      row.data[idx].deals += 1;
    }

    const data = Array.from(byManager.values()).map((m) => {
      let cum = 0;
      return {
        managerId: m.managerId,
        name: m.name,
        data: m.data.map((p) => {
          cum += p.amount;
          return { date: p.date, amount: cum, deals: p.deals };
        }),
      };
    });

    return jsonOk({ hasCrm: true, data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
