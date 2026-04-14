import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  bitrixLeadExportRowsForDay,
  buildBitrixDailyReportData,
} from "@/lib/bitrix/reporting";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import {
  refreshAmoTokensIfNeeded,
  syncAmoConnection,
} from "@/lib/integrations/amocrm/sync";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { exportDailyReport } from "@/lib/integrations/google/sheets";
import { setTelegramWebhook } from "@/lib/integrations/telegram/bot";
import {
  broadcastToAll,
} from "@/lib/integrations/telegram/notifications";
import type { DailyReportData } from "@/lib/integrations/telegram/types";
export type SchedulerJobResult = {
  job: string;
  ok: boolean;
  detail?: string;
};

/** Синхронизация справочников CRM (воронки, менеджеры), без лидов/сделок в БД */
export async function syncAllCrm(): Promise<SchedulerJobResult> {
  const conns = await prisma.crmConnection.findMany({ where: { isActive: true } });
  const errors: string[] = [];
  for (const c of conns) {
    try {
      if (c.crmType === "bitrix24") await syncBitrix24Connection(c.id);
      else if (c.crmType === "amocrm") await syncAmoConnection(c.id);
    } catch (e) {
      errors.push(
        `${c.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return {
    job: "syncAllCrm",
    ok: errors.length === 0,
    detail: errors.length ? errors.join("; ") : `connections=${conns.length}`,
  };
}

export async function refreshAllAmoTokens(): Promise<SchedulerJobResult> {
  const conns = await prisma.crmConnection.findMany({
    where: { crmType: "amocrm", isActive: true },
  });
  for (const c of conns) {
    try {
      await refreshAmoTokensIfNeeded(c.id);
    } catch {
      /* ignore */
    }
  }
  return { job: "refreshAllAmoTokens", ok: true, detail: `count=${conns.length}` };
}

export async function exportToSheetsNightly(): Promise<SchedulerJobResult> {
  const conns = await prisma.googleConnection.findMany({
    where: { sheetsEnabled: true, sheetsSpreadsheetId: { not: null } },
  });
  const day = new Date();
  const errors: string[] = [];
  for (const gc of conns) {
    try {
      const { accessToken } = await getGoogleAccessToken(gc.id);
      const sid = gc.sheetsSpreadsheetId!;
      const rows = await bitrixLeadExportRowsForDay(day);
      await exportDailyReport(accessToken, sid, day, rows);
    } catch (e) {
      errors.push(gc.id + ": " + (e instanceof Error ? e.message : String(e)));
    }
  }
  return {
    job: "exportToSheetsNightly",
    ok: errors.length === 0,
    detail: errors.length ? errors.join("; ") : `sheets=${conns.length}`,
  };
}

async function buildDailyReportData(): Promise<DailyReportData> {
  const data = await buildBitrixDailyReportData();
  return {
    date: data.date,
    leadsCount: data.leadsCount,
    soldCount: data.soldCount,
    soldAmount: data.soldAmount,
    lostCount: data.lostCount,
    inProgressCount: data.inProgressCount,
    bestManager: data.bestManager,
  };
}

export async function sendDailyTelegramReports(
  onlyIfMatchesSchedule = true,
): Promise<SchedulerJobResult> {
  const now = new Date();

  const connections = await prisma.telegramConnection.findMany({
    where: { isActive: true, notifyDailyReport: true },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      if (onlyIfMatchesSchedule) {
        const t = (conn.dailyReportTime ?? "18:00").trim();
        if (!matchesDailyTimeSlot(t, now)) continue;
      }

      const token = decrypt(conn.botToken);
      if (!token) continue;

      const data = await buildDailyReportData();
      await broadcastToAll(conn.id, token, "DAILY_REPORT", data);
      const n = await prisma.telegramChat.count({
        where: { connectionId: conn.id, isActive: true },
      });
      sent += n;
    } catch (e) {
      errors.push(conn.id + ": " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return {
    job: "sendDailyTelegramReports",
    ok: errors.length === 0,
    detail: `messages≈${sent}${errors.length ? "; " + errors.join("; ") : ""}`,
  };
}

function matchesDailyTimeSlot(schedule: string, now: Date): boolean {
  const parts = schedule.split(":").map((s) => parseInt(s.trim(), 10));
  const h = parts[0];
  const m = parts[1] ?? 0;
  if (Number.isNaN(h)) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const target = h * 60 + m;
  return cur >= target && cur < target + 5;
}

export async function registerTelegramWebhooks(): Promise<SchedulerJobResult> {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const conns = await prisma.telegramConnection.findMany({
    where: { isActive: true },
  });
  const errors: string[] = [];
  for (const c of conns) {
    try {
      const token = decrypt(c.botToken);
      if (!token) continue;
      const url = `${base.replace(/\/$/, "")}/api/webhooks/telegram?connectionId=${c.id}`;
      await setTelegramWebhook(token, url, secret);
    } catch (e) {
      errors.push(c.id + ": " + (e instanceof Error ? e.message : String(e)));
    }
  }
  return {
    job: "registerTelegramWebhooks",
    ok: errors.length === 0,
    detail: errors.length ? errors.join("; ") : `hooks=${conns.length}`,
  };
}

export async function runAllScheduledJobs(): Promise<SchedulerJobResult[]> {
  return [
    await syncAllCrm(),
    await refreshAllAmoTokens(),
    await exportToSheetsNightly(),
    await sendDailyTelegramReports(false),
    await registerTelegramWebhooks(),
  ];
}
