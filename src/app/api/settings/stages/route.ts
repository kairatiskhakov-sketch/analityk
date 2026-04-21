import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgId } from "@/lib/org/context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    const orgId = await resolveOrgId();

    const stages = await prisma.stageConfig.findMany({
      where: { orgId, crmType: "bitrix24" },
      orderBy: [{ pipelineName: "asc" }, { sort: "asc" }],
    });
    return NextResponse.json({ stages, sessionUserId: session?.user?.id ?? null });
  } catch (e) {
    console.error("Stages GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

type PostBody = {
  stages: {
    externalId: string;
    name: string;
    pipelineId: string;
    pipelineName: string;
    type: string;
    sort?: number;
    color?: string | null;
  }[];
};

export async function POST(req: Request) {
  try {
    await auth();
    const orgId = await resolveOrgId();

    const body = (await req.json()) as PostBody;
    if (!body.stages || !Array.isArray(body.stages)) {
      return NextResponse.json({ error: "Нужен массив stages" }, { status: 400 });
    }

    for (const stage of body.stages) {
      await prisma.stageConfig.upsert({
        where: {
          orgId_externalId_crmType: {
            orgId,
            externalId: stage.externalId,
            crmType: "bitrix24",
          },
        },
        create: {
          orgId,
          externalId: stage.externalId,
          name: stage.name,
          pipelineId: stage.pipelineId,
          pipelineName: stage.pipelineName,
          type: stage.type,
          sort: Number(stage.sort ?? 0),
          color: stage.color ?? null,
          crmType: "bitrix24",
        },
        update: {
          type: stage.type,
          sort: Number(stage.sort ?? 0),
          color: stage.color ?? null,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Stages POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
