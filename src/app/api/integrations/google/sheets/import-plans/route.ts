import { jsonError, jsonOk } from "@/lib/http/json";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { importSalesPlans } from "@/lib/integrations/google/sheets";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }

    const orgId = await resolveOrgId();
    const owner = await prisma.googleConnection.findUnique({
      where: { id: body.connectionId },
      select: { orgId: true },
    });
    if (!owner || owner.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }

    const { accessToken, connection } = await getGoogleAccessToken(body.connectionId);
    if (!connection.sheetsEnabled || !connection.sheetsSpreadsheetId) {
      return jsonError("Sheets выключен или нет spreadsheetId", 400);
    }

    const { imported } = await importSalesPlans(
      accessToken,
      connection.sheetsSpreadsheetId,
    );

    return jsonOk({ imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка импорта планов";
    return jsonError(msg, 500);
  }
}
