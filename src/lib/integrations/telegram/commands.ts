import { prisma } from "@/lib/prisma";
import { syncAmoConnection } from "@/lib/integrations/amocrm/sync";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import { createTelegramBot } from "./bot";
import { leadsPeriodKeyboard, mainMenuKeyboard, statsPeriodKeyboard } from "./keyboards";
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

async function fetchStatsText(period: Period): Promise<string> {
  const { start, end } = rangeForPeriod(period);
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: start, lte: end } },
  });
  const newCount = leads.filter((l) => l.status === "new").length;
  const won = leads.filter((l) => l.status === "won");
  const lost = leads.filter((l) => l.status === "lost");
  const sales = won.reduce((s, l) => s + l.amount, 0);
  const conv =
    leads.length > 0 ? Math.round((won.length / leads.length) * 100) : 0;

  const label =
    period === "today"
      ? "сегодня"
      : period === "week"
        ? "за неделю"
        : "за месяц";

  return [
    `📊 <b>Статистика ${label}</b>`,
    `💰 Продажи: ${fmtMoney(sales)} ₸`,
    `🎯 Лидов: ${leads.length} (${newCount} новых)`,
    `✅ Закрыто в плюс: ${won.length}`,
    `❌ Провалено: ${lost.length}`,
    `📈 Конверсия в успех: ${conv}%`,
  ].join("\n");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

async function fetchLeadsText(period: Period): Promise<string> {
  const { start, end } = rangeForPeriod(period);
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: { manager: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  if (!leads.length) return "Нет лидов за период.";

  const lines = leads.map((l) => {
    const icon =
      l.status === "won" ? "✅" : l.status === "lost" ? "❌" : "🆕";
    const reason = l.failReason ? ` (${l.failReason})` : "";
    return `${icon} ${l.name} — ${l.source} — ${fmtMoney(l.amount)} ₸ — ${l.status}${reason}`;
  });
  return ["<b>Последние лиды</b>", ...lines].join("\n");
}

async function fetchManagersText(): Promise<string> {
  const { start } = rangeForPeriod("month");
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: { gte: start },
      status: "won",
      managerId: { not: null },
    },
    include: { manager: true },
  });
  const byManager = new Map<string, { name: string; sum: number; count: number }>();
  for (const l of leads) {
    if (!l.manager) continue;
    const cur = byManager.get(l.manager.id) ?? {
      name: l.manager.name,
      sum: 0,
      count: 0,
    };
    cur.sum += l.amount;
    cur.count += 1;
    byManager.set(l.manager.id, cur);
  }
  const sorted = Array.from(byManager.values())
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 10);
  if (!sorted.length) return "Нет закрытых сделок за месяц.";

  const medals = ["🥇", "🥈", "🥉"];
  const lines = sorted.map((m, i) => {
    const med = medals[i] ?? "▪️";
    return `${med} ${m.name} — ${fmtMoney(m.sum)} ₸ (${m.count} сделок)`;
  });
  return ["<b>Рейтинг менеджеров (месяц)</b>", ...lines].join("\n");
}

async function fetchPlanText(): Promise<string> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const plans = await prisma.salesPlan.findMany({
    where: { period },
  });
  const fact = await prisma.lead.aggregate({
    where: {
      status: "won",
      closedAt: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
        lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      },
    },
    _sum: { amount: true },
  });
  const target = plans.reduce((s, p) => s + p.target, 0) || 5_000_000;
  const factAmount = fact._sum.amount ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((factAmount / target) * 100)) : 0;
  const barLen = 10;
  const filled = Math.round((pct / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

  return [
    `📅 План ${period}`,
    `🎯 План: ${fmtMoney(target)} ₸`,
    `✅ Факт: ${fmtMoney(factAmount)} ₸`,
    `📊 Выполнено: ${pct}% ${bar}`,
  ].join("\n");
}

async function runAllSync(): Promise<string> {
  const conns = await prisma.crmConnection.findMany({
    where: { isActive: true },
  });
  let leads = 0;
  let deals = 0;
  for (const c of conns) {
    try {
      if (c.crmType === "bitrix24") {
        const r = await syncBitrix24Connection(c.id);
        leads += r.leadsCount;
        deals += r.dealsCount;
      } else if (c.crmType === "amocrm") {
        const r = await syncAmoConnection(c.id);
        leads += r.leadsCount;
      }
    } catch {
      /* skip */
    }
  }
  return `Синхронизировано: ${leads} лидов, ${deals} сделок (Bitrix).`;
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
    await bot.sendMessage(chat.id, "CRM Sales Analytics. Команды: /stats /leads /managers /plan /sync /report", {
      reply_markup: mainMenuKeyboard(),
    });
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
