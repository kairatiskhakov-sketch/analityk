import {
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
  leadIsLost,
  leadIsWon,
  parseOpportunity,
} from "@/lib/bitrix/api";
import {
  fetchDealsCached,
  fetchLeadsCached,
  fetchManagersCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { computeWonDealFacts } from "@/lib/plan/bitrix-facts";
import {
  daysInRangeInclusive,
  elapsedDaysInPeriod,
  formatPeriodLabelRu,
  parsePeriodToRange,
  periodKeyFromDate,
} from "@/lib/plan/period";
import { syncAmoConnection } from "@/lib/integrations/amocrm/sync";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import { prisma } from "@/lib/prisma";
import { createTelegramBot } from "./bot";
import {
  leadsPeriodKeyboard,
  mainMenuKeyboard,
  statsPeriodKeyboard,
} from "./keyboards";
import { registerChat } from "./notifications";
import type TelegramBot from "node-telegram-bot-api";

type Period = "today" | "week" | "month";

function rangeForPeriod(period: Period): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start.setDate(end.getDate() - 7);
  } else {
    start.setMonth(end.getMonth() - 1);
  }
  return { start, end };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getBitrixUrl(): Promise<string | null> {
  const conn = await getActiveBitrixConnection();
  if (!conn) return null;
  return getBitrixWebhookBaseUrl(conn);
}

async function fetchStatsText(period: Period): Promise<string> {
  const { start, end } = rangeForPeriod(period);
  const url = await getBitrixUrl();
  if (!url) {
    return "Bitrix24 не подключён. Настройте CRM в Saldo.";
  }
  const [wonStageIds, stageConfigs, leads, deals] = await Promise.all([
    getOrSyncWonStageIds(url),
    getStageConfigs(),
    fetchLeadsCached(url, ymd(start), ymd(end)),
    fetchDealsCached(url, ymd(start), ymd(end)),
  ]);
  const newCount = leads.filter((l) => (l.STATUS_ID ?? "").toUpperCase() === "NEW")
    .length;
  const won = leads.filter(leadIsWon);
  const lost = leads.filter(leadIsLost);
  const leadSales = won.reduce((s, l) => s + parseOpportunity(l.OPPORTUNITY), 0);
  const dealSales = deals
    .filter((d) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds),
    )
    .reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0);
  const sales = leadSales + dealSales;
  const conv =
    leads.length > 0 ? Math.round((won.length / leads.length) * 100) : 0;

  const label =
    period === "today"
      ? "сегодня"
      : period === "week"
        ? "за неделю"
        : "за месяц";

  return [
    `📊 <b>Статистика ${label}</b> (Bitrix24 live)`,
    `💰 Продажи: ${fmtMoney(sales)} ₸`,
    `🎯 Лидов: ${leads.length} (${newCount} новых)`,
    `✅ Успешных лидов: ${won.length}`,
    `❌ Провалено: ${lost.length}`,
    `📈 Конверсия (лиды): ${conv}%`,
  ].join("\n");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

async function fetchLeadsText(period: Period): Promise<string> {
  const { start, end } = rangeForPeriod(period);
  const url = await getBitrixUrl();
  if (!url) return "Bitrix24 не подключён.";

  const [leads, managers, sources] = await Promise.all([
    fetchLeadsCached(url, ymd(start), ymd(end)),
    fetchManagersCached(url),
    fetchSourcesCatalogCached(url),
  ]);
  const mgrMap = new Map(managers.map((m) => [m.id, m.name]));
  const srcMap = new Map(sources.map((s) => [s.id, s.name]));

  const sorted = [...leads].slice(0, 15);
  if (!sorted.length) return "Нет лидов за период.";

  const lines = sorted.map((l) => {
    const st = (l.STATUS_ID ?? "").toUpperCase();
    const icon =
      st === "CONVERTED" ? "✅" : st === "JUNK" ? "❌" : "🆕";
    const src = srcMap.get((l.SOURCE_ID ?? "").toString()) ?? l.SOURCE_ID ?? "—";
    const mgr =
      mgrMap.get((l.ASSIGNED_BY_ID ?? "").toString()) ?? "—";
    return `${icon} ${(l.TITLE ?? "").trim() || "—"} — ${src} — ${fmtMoney(parseOpportunity(l.OPPORTUNITY))} ₸ — ${st} (${mgr})`;
  });
  return ["<b>Последние лиды (Bitrix24)</b>", ...lines].join("\n");
}

async function fetchManagersText(): Promise<string> {
  const { start, end } = rangeForPeriod("month");
  const url = await getBitrixUrl();
  if (!url) return "Bitrix24 не подключён.";

  const [wonStageIds, stageConfigs, deals] = await Promise.all([
    getOrSyncWonStageIds(url),
    getStageConfigs(),
    fetchDealsCached(url, ymd(start), ymd(end)),
  ]);
  const wonDeals = deals.filter((d) =>
    stageConfigs.length > 0
      ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
      : dealIsWon(d, wonStageIds),
  );
  const managers = await fetchManagersCached(url);
  const nameById = new Map(managers.map((m) => [m.id, m.name]));

  const byManager = new Map<
    string,
    { name: string; sum: number; count: number }
  >();
  for (const d of wonDeals) {
    const id = (d.ASSIGNED_BY_ID ?? "").toString();
    if (!id) continue;
    const name = nameById.get(id) ?? id;
    const cur = byManager.get(id) ?? { name, sum: 0, count: 0 };
    cur.sum += parseOpportunity(d.OPPORTUNITY);
    cur.count += 1;
    byManager.set(id, cur);
  }
  const sorted = Array.from(byManager.values())
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 10);
  if (!sorted.length) return "Нет выигранных сделок за месяц (Bitrix24).";

  const medals = ["🥇", "🥈", "🥉"];
  const lines = sorted.map((m, i) => {
    const med = medals[i] ?? "▪️";
    return `${med} ${m.name} — ${fmtMoney(m.sum)} ₸ (${m.count} сделок)`;
  });
  return ["<b>Рейтинг менеджеров (месяц, сделки won)</b>", ...lines].join("\n");
}

async function fetchPlanText(): Promise<string> {
  const now = new Date();
  const period = periodKeyFromDate(now, "month");
  const periodType = "month" as const;
  const url = await getBitrixUrl();
  if (!url) return "Bitrix24 не подключён.";

  const teamRow = await prisma.planTarget.findFirst({
    where: { period, periodType, managerId: null },
  });
  const target = teamRow?.target ?? 0;
  const { team: factAmount } = await computeWonDealFacts(url, period, periodType);

  const { start, end } = parsePeriodToRange(period, periodType);
  const totalDays = daysInRangeInclusive(start, end);
  const daysPassed = elapsedDaysInPeriod(start, end, now);
  const daysLeft = Math.max(0, totalDays - daysPassed);

  const pct = target > 0 ? Math.min(100, Math.round((factAmount / target) * 100)) : 0;
  const remaining = Math.max(0, target - factAmount);
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : 0;
  const title = formatPeriodLabelRu(period, periodType);

  const lines = [
    `📊 <b>План на ${title}</b>`,
    `🎯 Общий план: ${fmtMoney(target)} ₸`,
    `✅ Факт: ${fmtMoney(factAmount)} ₸`,
    `📈 Выполнено: ${pct}%`,
    `⏰ Осталось дней: ${daysLeft}`,
  ];
  if (target > 0 && factAmount < target && daysLeft > 0) {
    lines.push(`💡 Нужный темп: ${fmtMoney(Math.round(neededPerDay))} ₸/день`);
  }
  return lines.join("\n");
}

async function runAllSync(): Promise<string> {
  const conns = await prisma.crmConnection.findMany({
    where: { isActive: true },
  });
  const parts: string[] = [];
  for (const c of conns) {
    try {
      if (c.crmType === "bitrix24") {
        const r = await syncBitrix24Connection(c.id);
        parts.push(
          `Bitrix24: справочники обновлены (воронок ${r.pipelinesCount}, менеджеров ${r.managersCount}).`,
        );
      } else if (c.crmType === "amocrm") {
        const r = await syncAmoConnection(c.id);
        parts.push(`AmoCRM: менеджеров в кеше ${r.managersCount}.`);
      }
    } catch (e) {
      parts.push(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return parts.length ? parts.join("\n") : "Нет активных CRM.";
}

export async function dispatchTelegramUpdate(
  connectionId: string,
  botToken: string,
  update: TelegramBot.Update,
): Promise<void> {
  const bot = createTelegramBot(botToken);

  if (update.message) {
    await handleMessage(bot, connectionId, update.message);
    return;
  }

  if (update.callback_query && "data" in update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data ?? "";
    const chatId = cq.message?.chat.id;
    if (chatId == null) return;

    await bot.answerCallbackQuery(cq.id);

    if (data.startsWith("tg:stats:")) {
      const p = data.split(":")[2] as Period;
      const period = p === "week" || p === "month" ? p : "today";
      const text = await fetchStatsText(period);
      await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: statsPeriodKeyboard(),
      });
      return;
    }

    if (data.startsWith("tg:leads:")) {
      const p = data.split(":")[2] as Period;
      const period = p === "week" || p === "month" ? p : "today";
      const text = await fetchLeadsText(period);
      await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: leadsPeriodKeyboard(),
      });
      return;
    }

    if (data === "tg:managers") {
      await bot.sendMessage(chatId, await fetchManagersText(), {
        parse_mode: "HTML",
      });
      return;
    }

    if (data === "tg:plan") {
      await bot.sendMessage(chatId, await fetchPlanText(), { parse_mode: "HTML" });
      return;
    }
  }
}

async function handleMessage(
  bot: TelegramBot,
  connectionId: string,
  msg: TelegramBot.Message,
): Promise<void> {
  const chat = msg.chat;
  const text = msg.text?.trim() ?? "";
  const from = msg.from;

  await registerChat(
    connectionId,
    String(chat.id),
    chat.type === "private"
      ? "private"
      : chat.type === "supergroup"
        ? "supergroup"
        : "group",
    chat.title ?? chat.username ?? from?.first_name ?? null,
    null,
  );

  if (text.startsWith("/start")) {
    await bot.sendMessage(
      chat.id,
      "CRM Sales Analytics. Команды: /stats /leads /managers /plan /sync /report",
      {
        reply_markup: mainMenuKeyboard(),
      },
    );
    return;
  }

  if (text.startsWith("/stats")) {
    await bot.sendMessage(chat.id, await fetchStatsText("today"), {
      parse_mode: "HTML",
      reply_markup: statsPeriodKeyboard(),
    });
    return;
  }

  if (text.startsWith("/leads")) {
    const arg = text.split(/\s+/)[1] as string | undefined;
    const period: Period =
      arg === "week" ? "week" : arg === "month" ? "month" : "today";
    await bot.sendMessage(chat.id, await fetchLeadsText(period), {
      parse_mode: "HTML",
      reply_markup: leadsPeriodKeyboard(),
    });
    return;
  }

  if (text.startsWith("/managers")) {
    await bot.sendMessage(chat.id, await fetchManagersText(), { parse_mode: "HTML" });
    return;
  }

  if (text.startsWith("/plan")) {
    await bot.sendMessage(chat.id, await fetchPlanText(), { parse_mode: "HTML" });
    return;
  }

  if (text.startsWith("/sync")) {
    await bot.sendMessage(chat.id, await runAllSync());
    return;
  }

  if (text.startsWith("/report")) {
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    await bot.sendMessage(
      chat.id,
      `Отчёт PDF — в разработке. Дашборд: ${base}/dashboard`,
    );
    return;
  }
}
