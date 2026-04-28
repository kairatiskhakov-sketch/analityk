import {
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
} from "@/lib/bitrix/api";
import { fetchDealsCached, fetchLeadsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import { ymdLocal } from "@/lib/plan/period";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

const DAYS = 7;
const HOURS = 24;

function emptyMatrix(): number[][] {
  return Array.from({ length: DAYS }, () => Array.from({ length: HOURS }, () => 0));
}

/** Локальный day-of-week: понедельник = 0, воскресенье = 6. */
function dowMonFirst(d: Date): number {
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7;
}

function bumpAt(matrix: number[][], iso: unknown): void {
  const raw = String(iso ?? "").trim();
  if (!raw) return;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return;
  const d = new Date(ts);
  const day = dowMonFirst(d);
  const hour = d.getHours();
  if (day < 0 || day >= DAYS || hour < 0 || hour >= HOURS) return;
  matrix[day][hour] += 1;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const active = await getActiveBitrixConnection();
    const webhookUrl = active ? getBitrixWebhookBaseUrl(active) : null;
    if (!webhookUrl) {
      return jsonOk({
        leads: emptyMatrix(),
        deals: emptyMatrix(),
        leadsTotal: 0,
        dealsTotal: 0,
      });
    }

    const [wonStageIds, stageConfigs, leads, deals] = await Promise.all([
      getOrSyncWonStageIds(webhookUrl),
      getStageConfigs(),
      fetchLeadsCached(
        webhookUrl,
        ymdLocal(filters.start),
        ymdLocal(filters.end),
        filters.managerIds,
      ),
      fetchDealsCached(
        webhookUrl,
        ymdLocal(filters.start),
        ymdLocal(filters.end),
        filters.managerIds,
        filters.pipelineId,
      ),
    ]);

    const stageFilter = filters.stageIds ? new Set(filters.stageIds) : null;
    const scopedDeals = stageFilter
      ? deals.filter((d) => stageFilter.has(String(d.STAGE_ID ?? "")))
      : deals;

    const leadsMatrix = emptyMatrix();
    const dealsMatrix = emptyMatrix();
    let leadsTotal = 0;
    let dealsTotal = 0;

    for (const lead of leads) {
      bumpAt(leadsMatrix, lead.DATE_CREATE);
      leadsTotal += 1;
    }

    // Если у портала нет отдельных лидов (simple mode) — fallback на сделки
    if (leadsTotal === 0) {
      for (const d of scopedDeals) {
        bumpAt(leadsMatrix, d.DATE_CREATE);
        leadsTotal += 1;
      }
    }

    for (const d of scopedDeals) {
      const isWon =
        stageConfigs.length > 0
          ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
          : dealIsWon(d, wonStageIds);
      if (!isWon) continue;
      // Закрыто = CLOSEDATE; иначе по дате создания
      bumpAt(dealsMatrix, d.CLOSEDATE ?? d.DATE_CREATE);
      dealsTotal += 1;
    }

    return jsonOk({
      leads: leadsMatrix,
      deals: dealsMatrix,
      leadsTotal,
      dealsTotal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
