import { jsonError } from "@/lib/http/json";
import { buildGoogleAuthUrl } from "@/lib/integrations/google/oauth";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    if (!connectionId) {
      return jsonError("Нужен query connectionId (создайте через POST .../register)");
    }

    const orgId = await resolveOrgId();
    const conn = await prisma.googleConnection.findUnique({
      where: { id: connectionId },
      select: { orgId: true },
    });
    if (!conn || conn.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }

    const url = buildGoogleAuthUrl(connectionId);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
