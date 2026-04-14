import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import {
  getPeriodRange,
  periodKeyFromDate,
  type PlanPeriodType,
} from "@/lib/plan/period";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parsePeriodType(v: string | null): PlanPeriodType | null {
  if (v === "month" || v === "quarter" || v === "year") return v;
  return null;
}

/**
 * План из БД (быстро). Факт Bitrix — отдельно GET /api/plan/facts.
 * `factsOnly=false` — явно только план (то же поведение по умолчанию).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period =
      searchParams.get("period")?.trim() ||
      periodKeyFromDate(new Date(), "month");
    const periodType =
      parsePeriodType(searchParams.get("periodType")) ?? "month";

    try {
      getPeriodRange(period, periodType);
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

    const managersWithFacts = managers.map((mgr) => {
      const target = targetsRows.find((t) => t.managerId === mgr.id);
      const plan = target?.target ?? 0;
      return {
        id: mgr.id,
        externalId: mgr.externalId,
        name: mgr.name,
        plan,
        fact: 0,
        pct: 0,
      };
    });

    return jsonOk({
      period,
      periodType,
      totalPlan,
      totalFact: 0,
      managers: managersWithFacts,
      hasCrm: Boolean(url),
      factsOnly: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}

type TargetInput = { managerId: string | null; target: number };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      period?: string;
      periodType?: string;
      targets?: TargetInput[];
    };
    const period = body.period;
    const periodType = parsePeriodType(body.periodType ?? null);
    const targets = body.targets;
    if (!period || !periodType || !Array.isArray(targets)) {
      return jsonError("Некорректное тело запроса", 400);
    }

    for (const t of targets) {
      if (typeof t.target !== "number" || !Number.isFinite(t.target)) {
        return jsonError("target должен быть числом", 400);
      }
      if (t.managerId != null && typeof t.managerId !== "string") {
        return jsonError("managerId", 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.planTarget.deleteMany({ where: { period, periodType } });
      if (targets.length > 0) {
        await tx.planTarget.createMany({
          data: targets.map((t) => ({
            period,
            periodType,
            managerId: t.managerId,
            target: t.target,
          })),
        });
      }
    });

    return jsonOk({ saved: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
