import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOrgId } from "@/lib/org/context";

export const dynamic = "force-dynamic";

type PipelineDto = {
  id: string;
  name: string;
  stages: {
    externalId: string;
    name: string;
    type: string;
    sort: number;
    color: string;
  }[];
};

export async function GET() {
  try {
    const orgId = await resolveOrgId();
    const rows = await prisma.stageConfig.findMany({
      where: { orgId, crmType: "bitrix24" },
      orderBy: [{ pipelineName: "asc" }, { sort: "asc" }],
      select: {
        externalId: true,
        name: true,
        pipelineId: true,
        pipelineName: true,
        type: true,
        sort: true,
        color: true,
      },
    });

    const grouped = new Map<string, PipelineDto>();
    for (const row of rows) {
      const key = row.pipelineId || row.pipelineName || "default";
      const current = grouped.get(key);
      if (current) {
        current.stages.push({
          externalId: row.externalId,
          name: row.name,
          type: row.type,
          sort: row.sort ?? 0,
          color: row.color ?? "",
        });
        continue;
      }
      grouped.set(key, {
        id: row.pipelineId || key,
        name: row.pipelineName || "Без воронки",
        stages: [
          {
            externalId: row.externalId,
            name: row.name,
            type: row.type,
            sort: row.sort ?? 0,
            color: row.color ?? "",
          },
        ],
      });
    }

    const pipelines = Array.from(grouped.values()).map((pipeline) => ({
      ...pipeline,
      stages: [...pipeline.stages].sort((a, b) => a.sort - b.sort),
    }));

    return NextResponse.json(pipelines);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка загрузки воронок" },
      { status: 500 },
    );
  }
}
