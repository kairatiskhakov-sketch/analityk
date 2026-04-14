import { auth } from "@/auth";
import { BitrixAPI } from "@/lib/bitrix/api";
import { autoDetectStageType } from "@/lib/bitrix/stage-config";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return jsonError("Требуется вход", 401);
    }

    const dbConfigs = await prisma.stageConfig.findMany({
      where: { crmType: "bitrix24" },
      orderBy: [{ pipelineId: "asc" }, { updatedAt: "asc" }],
    });
    const dbMap = new Map(dbConfigs.map((c) => [c.externalId, c]));

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({
        pipelines: [] as {
          id: string;
          name: string;
          sort: number;
          stages: {
            externalId: string;
            name: string;
            sort: number;
            pipelineId: string;
            pipelineName: string;
            type: string;
            fromDb: boolean;
          }[];
        }[],
        configuredCount: dbConfigs.length,
        hasBitrix: false,
      });
    }

    const api = new BitrixAPI(url);
    const pipelines = await api.getPipelines();

    const merged = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      sort: p.sort,
      stages: p.stages.map((s) => {
        const existing = dbMap.get(s.statusId);
        const type =
          existing?.type ??
          autoDetectStageType(s.name);
        return {
          externalId: s.statusId,
          name: s.name,
          sort: s.sort,
          pipelineId: p.id,
          pipelineName: p.name,
          type,
          fromDb: Boolean(existing),
        };
      }),
    }));

    return jsonOk({
      pipelines: merged,
      configuredCount: dbConfigs.length,
      hasBitrix: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}

type PostBody = {
  stages: {
    externalId: string;
    name: string;
    pipelineId: string;
    pipelineName: string;
    type: string;
  }[];
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return jsonError("Требуется вход", 401);
    }

    const body = (await req.json()) as PostBody;
    if (!body.stages || !Array.isArray(body.stages)) {
      return jsonError("Нужен массив stages", 400);
    }

    const allowed = new Set(["won", "lost", "progress", "ignore"]);

    for (const s of body.stages) {
      if (!s.externalId || !s.type || !allowed.has(s.type)) {
        return jsonError("Некорректная запись стадии", 400);
      }
      await prisma.stageConfig.upsert({
        where: {
          externalId_crmType: {
            externalId: s.externalId,
            crmType: "bitrix24",
          },
        },
        create: {
          externalId: s.externalId,
          name: (s.name ?? "").trim() || s.externalId,
          pipelineId: String(s.pipelineId ?? ""),
          pipelineName: (s.pipelineName ?? "").trim() || "—",
          crmType: "bitrix24",
          type: s.type,
          color: null,
        },
        update: {
          name: (s.name ?? "").trim() || s.externalId,
          pipelineId: String(s.pipelineId ?? ""),
          pipelineName: (s.pipelineName ?? "").trim() || "—",
          type: s.type,
        },
      });
    }

    return jsonOk({ ok: true, saved: body.stages.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
