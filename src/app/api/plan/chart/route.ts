import { getStageConfigs, PLAN_FACT_DEAL_SELECT } from "@/lib/bitrix/api";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { buildPlanVsFactSeries } from "@/lib/plan/bitrix-facts";
import { fetchDealsMergedByChunks } from "@/lib/plan/plan-bitrix-deals";
import {
  parsePeriodToRange,
  ymdLocal,
  type PlanPeriodType,
} from "@/lib/plan/period";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";

export const dynamic = "force-dynamic";

function parsePeriodType(v: string | null): PlanPeriodType | null {
  if (v === "month" || v === "quarter" || v === "year") return v;
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");
    const periodType = parsePeriodType(searchParams.get("periodType"));
    const pipelineId = searchParams.get("pipelineId")?.trim() || undefined;
    const stageIds =
      searchParams.get("stageIds")?.split(",").map((v) => v.trim()).filter(Boolean) || [];
    if (!period || !periodType) {
      return jsonError("Укажите period и periodType", 400);
    }

    const orgId = await resolveOrgId();
    const teamRow = await prisma.planTarget.findFirst({
      where: { orgId, period, periodType, managerId: null },
    });
    const teamTarget = teamRow?.target ?? 0;

    const conn = await getActiveBitrixConnection(orgId);
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ series: [] as { date: string; fact: number; planLine: number }[] });
    }

    const { start, end } = parsePeriodToRange(period, periodType);
    const df = ymdLocal(start);
    const dt = ymdLocal(end);

    const [wonStageIds, stageConfigs, deals] = await Promise.all([
      getOrSyncWonStageIds(url),
      getStageConfigs(),
      fetchDealsMergedByChunks(
        url,
        df,
        dt,
        PLAN_FACT_DEAL_SELECT,
        pipelineId,
        undefined,
        "DATE_CREATE",
      ),
    ]);
    const series = buildPlanVsFactSeries(
      deals,
      teamTarget,
      period,
      periodType,
      stageIds.length ? stageIds : wonStageIds,
      stageIds.length ? undefined : stageConfigs,
    );

    return jsonOk({ series });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
