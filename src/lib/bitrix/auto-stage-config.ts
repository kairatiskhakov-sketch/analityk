import { BitrixAPI } from "@/lib/bitrix/api";
import { getBitrixWebhookBaseUrl } from "@/lib/bitrix/connection";
import { prisma } from "@/lib/prisma";

type AutoStage = {
  externalId: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  type: "won" | "lost" | "progress";
  sort: number;
  color?: string;
};

function mapSemanticsToType(semantics?: string): "won" | "lost" | "progress" {
  const s = String(semantics ?? "").toLowerCase();
  if (s === "success" || s === "s") return "won";
  if (s === "failure" || s === "f") return "lost";
  return "progress";
}

export async function autoLoadStageConfigs(webhookUrl: string): Promise<number> {
  const api = new BitrixAPI(webhookUrl);
  const pipelines = await api.getPipelines();
  const stages: AutoStage[] = [];

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages ?? []) {
      stages.push({
        externalId: stage.statusId,
        name: stage.name,
        pipelineId: String(pipeline.id),
        pipelineName: pipeline.name,
        type: mapSemanticsToType(stage.semantics),
        sort: Number(stage.sort ?? 0),
        color: stage.color,
      });
    }
  }

  for (const stage of stages) {
    await prisma.stageConfig.upsert({
      where: {
        externalId_crmType: {
          externalId: stage.externalId,
          crmType: "bitrix24",
        },
      },
      create: {
        externalId: stage.externalId,
        name: stage.name,
        pipelineId: stage.pipelineId,
        pipelineName: stage.pipelineName,
        type: stage.type,
        sort: stage.sort,
        color: stage.color ?? null,
        crmType: "bitrix24",
      },
      update: {
        name: stage.name,
        pipelineId: stage.pipelineId,
        pipelineName: stage.pipelineName,
        type: stage.type,
        sort: stage.sort,
        color: stage.color ?? null,
      },
    });
  }

  return stages.length;
}

export async function autoLoadStageConfigsByConnectionId(
  connectionId: string,
): Promise<number> {
  const connection = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || connection.crmType !== "bitrix24" || !connection.isActive) {
    return 0;
  }
  const webhookUrl = getBitrixWebhookBaseUrl(connection);
  if (!webhookUrl) return 0;
  return autoLoadStageConfigs(webhookUrl);
}
