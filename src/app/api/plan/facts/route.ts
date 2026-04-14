import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { fetchManagersCached } from "@/lib/bitrix/cache";
import {
  fetchPlanFactsUncached,
  resolveFactForPlanManager,
} from "@/lib/plan/bitrix-facts";
import {
  getPeriodRange,
  periodKeyFromDate,
  type PlanPeriodType,
} from "@/lib/plan/period";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const FACTS_TIMEOUT_MS = 25_000;

function parsePeriodType(v: string | null): PlanPeriodType | null {
  if (v === "month" || v === "quarter" || v === "year") return v;
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period =
      searchParams.get("period")?.trim() ||
      periodKeyFromDate(new Date(), "month");
    const periodType =
      parsePeriodType(searchParams.get("periodType")) ?? "month";

    let dateFrom: string;
    let dateTo: string;
    try {
      const r = getPeriodRange(period, periodType);
      dateFrom = r.dateFrom;
      dateTo = r.dateTo;
    } catch {
      return jsonError("Некорректный period", 400);
    }

    const [targetsRows, managers] = await Promise.all([
      prisma.planTarget.findMany({
        where: { period, periodType },
        select: { managerId: true, target: true },
      }),
      prisma.manager.findMany({
        where: { crmType: "bitrix24", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, externalId: true, name: true },
      }),
    ]);

    const totalTargetRow = targetsRows.find((t) => t.managerId === null);
    const totalPlan = totalTargetRow?.target ?? 0;

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;

    let totalFact = 0;
    let byManager: Record<string, number> = {};
    let warning: string | undefined;

    let bitrixUsers: { id: string; name: string }[] = [];

    if (url) {
      try {
        const fact = await Promise.race([
          fetchPlanFactsUncached(url, dateFrom, dateTo),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), FACTS_TIMEOUT_MS),
          ),
        ]);
        totalFact = fact.totalFact;
        byManager = { ...fact.byManager };

        console.log("=== PLAN FACTS DEBUG ===");
        console.log("totalFact:", totalFact);
        console.log("byManager:", JSON.stringify(byManager));
        console.log(
          "managers externalIds:",
          managers.map((m) => ({
            id: m.id,
            externalId: m.externalId,
            name: m.name,
          })),
        );

        try {
          bitrixUsers = await fetchManagersCached(url);
        } catch {
          bitrixUsers = [];
        }

        for (const mgr of managers) {
          const key = String(mgr.externalId);
          const raw = byManager[key];
          console.log(
            `Manager ${mgr.name}: externalId="${key}" fact=${raw === undefined ? "undefined" : raw}`,
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message === "timeout") {
          warning = "Bitrix не ответил вовремя. Попробуйте позже.";
        } else {
          throw e;
        }
      }
    }

    const managersWithFacts = managers.map((mgr) => {
      const target = targetsRows.find((t) => t.managerId === mgr.id);
      const plan = target?.target ?? 0;
      const bitrixId = String(mgr.externalId);
      const resolved = url
        ? resolveFactForPlanManager(mgr, byManager, bitrixUsers)
        : { fact: 0 as number, source: "none" as const };
      const fact = resolved.fact;
      const pct = plan > 0 ? Math.round((fact / plan) * 100) : 0;

      if (url) {
        if (resolved.source === "name" && resolved.matchedBitrixId != null) {
          console.log(
            `Matched by name: ${mgr.name} → bitrixId=${resolved.matchedBitrixId} fact=${fact}`,
          );
        }
        console.log(
          `Matching: mgr="${mgr.name}" ` +
            `externalId="${bitrixId}" ` +
            `source=${resolved.source} ` +
            `byManagerKeys=${Object.keys(byManager).join(",")} ` +
            `fact=${fact}`,
        );
      }

      return {
        id: mgr.id,
        externalId: mgr.externalId,
        name: mgr.name,
        plan,
        fact,
        pct,
      };
    });

    return jsonOk({
      period,
      periodType,
      totalPlan,
      totalFact,
      managers: managersWithFacts,
      hasCrm: Boolean(url),
      ...(warning ? { warning } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
