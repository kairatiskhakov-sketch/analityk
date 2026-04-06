import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import {
  refreshAmoTokensIfNeeded,
  syncAmoConnection,
} from "@/lib/integrations/amocrm/sync";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { exportDailyReport } from "@/lib/integrations/google/sheets";
import type { LeadExportRow } from "@/lib/integrations/google/sheets";
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

/** Каждые ~30 мин: синхронизация всех активных CRM */
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

/** Каждые ~60 мин: обновление OAuth-токенов AmoCRM */
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

/** Ночной экспорт в Google Sheets (лиды за «сегодня» по серверу) */
export async function exportToSheetsNightly(): Promise<SchedulerJobResult> {
  const conns = await prisma.googleConnection.findMany({
    where: { sheetsEnabled: true, sheetsSpreadsheetId: { not: null } },
  });
  const day = new Date();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const errors: string[] = [];
  for (const gc of conns) {
    try {
      const { accessToken } = await getGoogleAccessToken(gc.id);
      const sid = gc.sheetsSpreadsheetId!;
      const leads = await prisma.lead.findMany({
        where: { createdAt: { gte: start, lte: end } },
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
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: { manager: true },
  });
  const won = leads.filter((l) => l.status === "won");
  const lost = leads.filter((l) => l.status === "lost");
  const inProgress = leads.filter(
    (l) => l.status === "in_progress" || l.status === "new",
  );
  const soldAmount = won.reduce((s, l) => s + l.amount, 0);

  const byMgr = new Map<string, { name: string; wins: number }>();
  for (const l of won) {
    if (!l.manager) continue;
    const cur = byMgr.get(l.manager.id) ?? { name: l.manager.name, wins: 0 };
    cur.wins += 1;
    byMgr.set(l.manager.id, cur);
  }
  const best = Array.from(byMgr.values()).sort((a, b) => b.wins - a.wins)[0];

  return {
    date: start.toISOString().slice(0, 10),
    leadsCount: leads.length,
    soldCount: won.length,
    soldAmount,
    lostCount: lost.length,
    inProgressCount: inProgress.length,
    bestManager: best?.name,
  };
}

/** Ежедневный отчёт в Telegram (`onlyIfMatchesSchedule`: слот 5 мин около времени из `dailyReportTime`) */
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

/** Окно 5 минут от заданного HH:MM */
function matchesDailyTimeSlot(schedule: string, now: Date): boolean {
  const parts = schedule.split(":").map((s) => parseInt(s.trim(), 10));
  const h = parts[0];
  const m = parts[1] ?? 0;
  if (Number.isNaN(h)) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const target = h * 60 + m;
  return cur >= target && cur < target + 5;
}

/** При старте: зарегистрировать webhook Telegram для активных ботов */
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

/** Все задачи подряд (для ручного запуска) */
export async function runAllScheduledJobs(): Promise<SchedulerJobResult[]> {
  return [
    await syncAllCrm(),
    await refreshAllAmoTokens(),
    await exportToSheetsNightly(),
    await sendDailyTelegramReports(false),
    await registerTelegramWebhooks(),
  ];
}
