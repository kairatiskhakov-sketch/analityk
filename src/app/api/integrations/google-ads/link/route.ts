import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/google-ads/link
 * body: {
 *   googleConnectionId: string,
 *   customerId: string,              // без дефисов
 *   accountName?: string,
 *   loginCustomerId?: string,        // MCC, если нужен
 *   developerToken?: string          // override на случай нескольких проектов
 * }
 *
 * Создаёт (или обновляет) AdConnection(platform=GOOGLE) со ссылкой на
 * GoogleConnection через extra. OAuth-токены не копируем — sync всегда
 * рефрешит их через getGoogleAccessToken(googleConnectionId).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      googleConnectionId?: string;
      customerId?: string;
      accountName?: string;
      loginCustomerId?: string;
      developerToken?: string;
    };
    const googleConnectionId = body.googleConnectionId?.trim();
    const customerId = body.customerId?.trim().replace(/-/g, "");
    if (!googleConnectionId || !customerId) {
      return jsonError("Нужны googleConnectionId и customerId");
    }

    const orgId = await resolveOrgId();
    const gconn = await prisma.googleConnection.findUnique({
      where: { id: googleConnectionId },
      select: { id: true, orgId: true },
    });
    if (!gconn || (gconn.orgId && gconn.orgId !== orgId)) {
      return jsonError("Google подключение не найдено", 404);
    }

    const extraPayload = {
      googleConnectionId,
      loginCustomerId: body.loginCustomerId?.trim() || null,
      developerToken: body.developerToken?.trim() || null,
    };
    const extra = JSON.stringify(extraPayload);
    // AdConnection.accessToken non-null, но реальный OAuth-токен живёт в
    // GoogleConnection. Пишем синтетический маркер — никогда не читается.
    const accessToken = encrypt(`google-linked:${googleConnectionId}`);

    const conn = await prisma.adConnection.upsert({
      where: {
        orgId_platform_accountId: {
          orgId,
          platform: "GOOGLE",
          accountId: customerId,
        },
      },
      create: {
        orgId,
        platform: "GOOGLE",
        accountId: customerId,
        accountName: body.accountName?.trim() || null,
        accessToken,
        extra,
        status: "ACTIVE",
      },
      update: {
        accountName: body.accountName?.trim() || null,
        accessToken,
        extra,
        status: "ACTIVE",
        lastError: null,
      },
    });

    return jsonOk({
      connection: {
        id: conn.id,
        accountId: conn.accountId,
        accountName: conn.accountName,
        status: conn.status,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
