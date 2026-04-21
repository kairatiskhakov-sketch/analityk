import { bitrixLeadExportRowsForDay } from "@/lib/bitrix/reporting";
import { jsonError, jsonOk } from "@/lib/http/json";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { exportDailyReport } from "@/lib/integrations/google/sheets";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      connectionId?: string;
      date?: string;
      mode?: "created" | "closed_won";
    };
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

    const day = body.date ? new Date(body.date) : new Date();
    const mode = body.mode === "closed_won" ? "closed_won" : "created";
    const rows = await bitrixLeadExportRowsForDay(day, mode);

    await exportDailyReport(
      accessToken,
      connection.sheetsSpreadsheetId,
      day,
      rows,
    );

    return jsonOk({
      exported: rows.length,
      mode,
      spreadsheetId: connection.sheetsSpreadsheetId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка Sheets";
    return jsonError(msg, 500);
  }
}
