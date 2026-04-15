import { BitrixAPI } from "@/lib/bitrix/api";
import { getActiveBitrixConnection, getBitrixWebhookBaseUrl } from "@/lib/bitrix/connection";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const connection = await getActiveBitrixConnection();
    const webhookUrl = connection ? getBitrixWebhookBaseUrl(connection) : null;
    if (!webhookUrl) {
      return NextResponse.json({ managers: [], pipelines: [] });
    }

    const api = new BitrixAPI(webhookUrl);
    const [managers, pipelinesRaw, stageConfigs] = await Promise.all([
      prisma.manager.findMany({
        where: { crmType: "bitrix24", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, externalId: true, name: true },
      }),
      api.getPipelines(),
      prisma.stageConfig.findMany({ where: { crmType: "bitrix24" } }),
    ]);

    const stageConfigMap = Object.fromEntries(
      stageConfigs.map((s) => [s.externalId, s]),
    );

    const pipelines = pipelinesRaw.map((p) => ({
      id: String(p.id),
      name: p.name,
      stages: (p.stages || []).map((s) => ({
        id: s.statusId,
        name: s.name,
        type: stageConfigMap[s.statusId]?.type || "progress",
      })),
    }));

    return NextResponse.json({ managers, pipelines });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки фильтров" },
      { status: 500 },
    );
  }
}
