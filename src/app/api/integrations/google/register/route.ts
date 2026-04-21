import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Создаёт запись подключения Google (до OAuth). Затем GET /api/integrations/google/auth?connectionId=...
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      connectionId?: string;
      adsEnabled?: boolean;
      sheetsEnabled?: boolean;
      analyticsEnabled?: boolean;
      adsCustomerId?: string | null;
      adsDeveloperToken?: string | null;
      sheetsSpreadsheetId?: string | null;
      analyticsPropertyId?: string | null;
    };

    const orgId = await resolveOrgId();
    const encEmpty = encrypt("");
    const devTok = body.adsDeveloperToken?.trim()
      ? encrypt(body.adsDeveloperToken.trim())
      : null;

    if (body.connectionId) {
      const existing = await prisma.googleConnection.findUnique({
        where: { id: body.connectionId },
        select: { orgId: true },
      });
      if (!existing || existing.orgId !== orgId) {
        return jsonError("Подключение не найдено", 404);
      }
      const updated = await prisma.googleConnection.update({
        where: { id: body.connectionId },
        data: {
          adsEnabled: body.adsEnabled ?? undefined,
          sheetsEnabled: body.sheetsEnabled ?? undefined,
          analyticsEnabled: body.analyticsEnabled ?? undefined,
          adsCustomerId: body.adsCustomerId ?? undefined,
          adsDeveloperToken: devTok ?? undefined,
          sheetsSpreadsheetId: body.sheetsSpreadsheetId ?? undefined,
          analyticsPropertyId: body.analyticsPropertyId ?? undefined,
        },
      });
      return jsonOk({ connection: updated });
    }

    const created = await prisma.googleConnection.create({
      data: {
        orgId,
        email: "pending@oauth.local",
        accessToken: encEmpty,
        refreshToken: encEmpty,
        tokenExpiresAt: new Date(0),
        adsEnabled: !!body.adsEnabled,
        sheetsEnabled: !!body.sheetsEnabled,
        analyticsEnabled: !!body.analyticsEnabled,
        adsCustomerId: body.adsCustomerId ?? null,
        adsDeveloperToken: devTok,
        sheetsSpreadsheetId: body.sheetsSpreadsheetId ?? null,
        analyticsPropertyId: body.analyticsPropertyId ?? null,
      },
    });
    return jsonOk({ connection: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
