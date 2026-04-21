import { jsonError } from "@/lib/http/json";
import { buildAmoAuthorizationUrl } from "@/lib/integrations/amocrm/oauth";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    if (!connectionId) {
      return jsonError("Нужен query connectionId");
    }

    const orgId = await resolveOrgId();
    const conn = await prisma.crmConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn || conn.crmType !== "amocrm" || !conn.amoSubdomain || conn.orgId !== orgId) {
      return jsonError("Подключение AmoCRM не найдено", 404);
    }

    const clientId = conn.amoClientId ?? process.env.AMOCRM_CLIENT_ID;
    if (!clientId) {
      return jsonError("Не задан client_id (в подключении или AMOCRM_CLIENT_ID)");
    }

    const redirectUri =
      process.env.AMOCRM_REDIRECT_URI ??
      `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/crm/amo/callback`;
    if (!redirectUri) {
      return jsonError("Задайте AMOCRM_REDIRECT_URI или NEXTAUTH_URL");
    }

    const url = buildAmoAuthorizationUrl(
      conn.amoSubdomain,
      clientId,
      redirectUri,
      connectionId,
    );

    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
