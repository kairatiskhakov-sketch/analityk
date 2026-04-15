import { auth } from "@/auth";
import { BitrixAPI } from "@/lib/bitrix/api";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { getActiveBitrixConnection, getBitrixWebhookBaseUrl } from "@/lib/bitrix/connection";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  const session = await auth();
  console.log("fails session:", JSON.stringify(session));

  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const pipelineId = searchParams.get("pipelineId") || "";
    const managerIds = searchParams.get("managers")?.split(",").filter(Boolean) || [];

    const connection = await getActiveBitrixConnection();
    const webhookUrl = connection ? getBitrixWebhookBaseUrl(connection) : null;
    if (!webhookUrl) {
      return NextResponse.json({ fails: [] });
    }

    const api = new BitrixAPI(webhookUrl);
    const wonStageIds = await getOrSyncWonStageIds(webhookUrl);
    console.log("Won stage IDs:", wonStageIds);
    const toDate = dateTo || formatYmd(new Date());
    const fromDate = dateFrom || formatYmd(new Date(Date.now() - 6 * 86400000));
    const lostStageConfigs = await prisma.stageConfig.findMany({
      where: { crmType: "bitrix24", type: "lost" },
    });
    const lostStageIds = lostStageConfigs.map((s) => s.externalId);
    console.log("Lost stage IDs from config:", lostStageIds);

    if (lostStageIds.length === 0) {
      return NextResponse.json({
        fails: [],
        warning: "Настройте этапы провала в разделе Настройки → Воронки и этапы",
      });
    }

    const deals = await api.getDeals({
      dateFrom: fromDate,
      dateTo: toDate,
      managerIds: managerIds.length ? managerIds : undefined,
      categoryId: pipelineId || undefined,
      select: [
        "ID",
        "STAGE_ID",
        "OPPORTUNITY",
        "ASSIGNED_BY_ID",
        "CATEGORY_ID",
        "DATE_CREATE",
        "CLOSEDATE",
        "COMMENTS",
      ],
    });

    console.log("Total deals:", deals.length);
    console.log("All deal STAGE_IDs:", Array.from(new Set(deals.map((d) => d.STAGE_ID))));

    const lostDeals = deals.filter((d) => lostStageIds.includes(String(d.STAGE_ID ?? "")));
    console.log("Lost deals:", lostDeals.length);

    const stageNames: Record<string, string> = {};
    for (const config of lostStageConfigs) {
      stageNames[config.externalId] = config.name;
    }

    const grouped: Record<string, number> = {};
    for (const deal of lostDeals) {
      const stageId = String(deal.STAGE_ID ?? "");
      const stageName = stageNames[stageId] || stageId || "Неизвестный этап";
      grouped[stageName] = (grouped[stageName] || 0) + 1;
    }

    const fails = Object.entries(grouped)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    console.log("Fails result:", fails);
    return NextResponse.json({
      fails,
      source: "deals",
      totalLostDeals: lostDeals.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
