import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

function sheetsClient(accessToken: string) {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

/**
 * Создать таблицу с листами под дашборд.
 */
export async function createReportSpreadsheet(
  accessToken: string,
  title: string,
): Promise<string> {
  const sheets = sheetsClient(accessToken);
  const month = new Date().toISOString().slice(0, 7);
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: title.includes("{month}") ? title.replace("{month}", month) : title },
      sheets: [
        { properties: { title: "Продажи" } },
        { properties: { title: "Лиды" } },
        { properties: { title: "Менеджеры" } },
        { properties: { title: "Провалы" } },
        { properties: { title: "Планы" } },
      ],
    },
  });
  const id = res.data.spreadsheetId;
  if (!id) throw new Error("Sheets: нет spreadsheetId");
  return id;
}

export type LeadExportRow = {
  id: string;
  name: string;
  channel: string;
  manager: string;
  amount: number;
  status: string;
  reason: string;
  date: string;
};

/**
 * Записать строки на лист «Лиды» (с A1 — заголовки).
 */
export async function writeLeadsSheet(
  accessToken: string,
  spreadsheetId: string,
  rows: LeadExportRow[],
): Promise<void> {
  const sheets = sheetsClient(accessToken);
  const header = [
    "ID",
    "Имя",
    "Канал",
    "Менеджер",
    "Сумма",
    "Статус",
    "Причина",
    "Дата",
  ];
  const data = [
    header,
    ...rows.map((r) => [
      r.id,
      r.name,
      r.channel,
      r.manager,
      String(r.amount),
      r.status,
      r.reason,
      r.date,
    ]),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Лиды!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: data },
  });
}

/**
 * Экспорт дневного отчёта (лиды за дату + заглушки под итоги).
 */
export async function exportDailyReport(
  accessToken: string,
  spreadsheetId: string,
  date: Date,
  leadRows: LeadExportRow[],
): Promise<void> {
  const sheets = sheetsClient(accessToken);
  const d = date.toISOString().slice(0, 10);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Лиды!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [`Отчёт за ${d}`],
        [],
        [
          "ID",
          "Имя",
          "Канал",
          "Менеджер",
          "Сумма",
          "Статус",
          "Причина",
          "Дата",
        ],
        ...leadRows.map((r) => [
          r.id,
          r.name,
          r.channel,
          r.manager,
          String(r.amount),
          r.status,
          r.reason,
          r.date,
        ]),
      ],
    },
  });
}

export async function exportMonthlyReport(
  accessToken: string,
  spreadsheetId: string,
  monthLabel: string,
  summaryLines: string[][],
): Promise<void> {
  const sheets = sheetsClient(accessToken);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Продажи!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[`Месяц: ${monthLabel}`], [], ...summaryLines],
    },
  });
}

export type SalesPlanRow = { period: string; managerName: string; target: number };

/**
 * Читает диапазон «Планы» (колонки: месяц, менеджер, сумма).
 */
export async function readSalesPlansRange(
  accessToken: string,
  spreadsheetId: string,
  range = "Планы!A2:C500",
): Promise<SalesPlanRow[]> {
  const sheets = sheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const values = res.data.values ?? [];
  const out: SalesPlanRow[] = [];
  for (const row of values) {
    const [period, managerName, targetRaw] = row;
    if (!period || !managerName) continue;
    const target = parseFloat(String(targetRaw ?? "").replace(/\s/g, "").replace(",", "."));
    if (Number.isNaN(target)) continue;
    out.push({
      period: String(period).trim(),
      managerName: String(managerName).trim(),
      target,
    });
  }
  return out;
}

/**
 * Импорт планов в `SalesPlan` (подбор менеджера по имени).
 */
export async function importSalesPlans(
  accessToken: string,
  spreadsheetId: string,
): Promise<{ imported: number }> {
  const rows = await readSalesPlansRange(accessToken, spreadsheetId);
  let imported = 0;

  for (const r of rows) {
    const manager = await prisma.manager.findFirst({
      where: { name: { contains: r.managerName, mode: "insensitive" } },
    });
    const managerId = manager?.id ?? null;

    const existing = await prisma.salesPlan.findFirst({
      where: { period: r.period, managerId },
    });

    if (existing) {
      await prisma.salesPlan.update({
        where: { id: existing.id },
        data: { target: r.target },
      });
    } else {
      await prisma.salesPlan.create({
        data: {
          period: r.period,
          managerId,
          target: r.target,
        },
      });
    }
    imported++;
  }

  return { imported };
}
