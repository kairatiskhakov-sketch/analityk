import { jsonError, jsonOk } from "@/lib/http/json";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { exportDailyReport, type LeadExportRow } from "@/lib/integrations/google/sheets";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      connectionId?: string;
      date?: string;
    };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }

    const { accessToken, connection } = await getGoogleAccessToken(body.connectionId);
    if (!connection.sheetsEnabled || !connection.sheetsSpreadsheetId) {
      return jsonError("Sheets выключен или нет spreadsheetId", 400);
    }

    const day = body.date ? new Date(body.date) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const leads = await prisma.lead.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: { manager: true },
    });

    const rows: LeadExportRow[] = leads.map((l) => ({
      id: l.id,
      name: l.name,
      channel: l.source,
      manager: l.manager?.name ?? "—",
      amount: l.amount,
      status: l.status,
      reason: l.failReason ?? "",
      date: l.createdAt.toISOString().slice(0, 10),
    }));

    await exportDailyReport(
      accessToken,
      connection.sheetsSpreadsheetId,
      day,
      rows,
    );

    return jsonOk({ exported: rows.length, spreadsheetId: connection.sheetsSpreadsheetId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка Sheets";
    return jsonError(msg, 500);
  }
}
