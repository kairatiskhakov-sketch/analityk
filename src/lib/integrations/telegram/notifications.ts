import { prisma } from "@/lib/prisma";
import { createTelegramBot } from "./bot";
import type {
  DailyReportData,
  DealNotificationData,
  NewLeadNotificationData,
  PlanAlertData,
  TelegramNotificationType,
} from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function formatNotificationText(
  type: TelegramNotificationType,
  data: unknown,
): string {
  switch (type) {
    case "NEW_LEAD": {
      const d = data as NewLeadNotificationData;
      return [
        "🆕 <b>Новый лид</b>",
        `👤 ${escapeHtml(d.name)}`,
        d.phone ? `📱 ${escapeHtml(d.phone)}` : "",
        `🎯 Источник: ${escapeHtml(d.source)}`,
        d.amount != null ? `💰 Бюджет: ${formatMoney(d.amount)} ₸` : "",
        d.managerName ? `👨‍💼 Менеджер: ${escapeHtml(d.managerName)}` : "",
        d.crmUrl ? `<a href="${escapeHtml(d.crmUrl)}">Открыть в CRM</a>` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "DEAL_WON": {
      const d = data as DealNotificationData;
      return [
        "✅ <b>Сделка закрыта!</b>",
        `👤 ${escapeHtml(d.name)}`,
        `💰 Сумма: ${formatMoney(d.amount)} ₸`,
        d.managerName ? `👨‍💼 Менеджер: ${escapeHtml(d.managerName)}` : "",
        "🎉 Поздравляем!",
      ].join("\n");
    }
    case "DEAL_LOST": {
      const d = data as DealNotificationData;
      return [
        "❌ <b>Сделка провалена</b>",
        `👤 ${escapeHtml(d.name)}`,
        `💰 Сумма: ${formatMoney(d.amount)} ₸`,
        d.reason ? `📝 Причина: ${escapeHtml(d.reason)}` : "",
        d.managerName ? `👨‍💼 Менеджер: ${escapeHtml(d.managerName)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "DAILY_REPORT": {
      const d = data as DailyReportData;
      return [
        `📊 <b>Итоги дня — ${escapeHtml(d.date)}</b>`,
        `Лидов получено: ${d.leadsCount}`,
        `Продано: ${d.soldCount} (${formatMoney(d.soldAmount)} ₸)`,
        `Провалено: ${d.lostCount}`,
        `В работе: ${d.inProgressCount}`,
        d.bestManager
          ? `Лучший менеджер: ${escapeHtml(d.bestManager)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "PLAN_ALERT": {
      const d = data as PlanAlertData;
      return [
        "⚠️ <b>Внимание! Риск не выполнить план</b>",
        `📅 Осталось дней: ${d.daysLeft}`,
        `🎯 До плана: ${formatMoney(d.gapAmount)} ₸`,
        `📈 Текущий темп: ${formatMoney(d.dailyPace)} ₸/день`,
        `💡 Нужно: ${formatMoney(d.neededPerDay)} ₸/день`,
      ].join("\n");
    }
    case "NEW_MANAGER_LEAD":
      return formatNotificationText("NEW_LEAD", data);
    default:
      return "Уведомление";
  }
}

export async function sendNotification(
  botToken: string,
  chatId: string,
  type: TelegramNotificationType,
  data: unknown,
): Promise<void> {
  const bot = createTelegramBot(botToken);
  const text = formatNotificationText(type, data);
  await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
}

/** Всем активным чатам подключения */
export async function broadcastToAll(
  connectionId: string,
  botToken: string,
  type: TelegramNotificationType,
  data: unknown,
): Promise<void> {
  const chats = await prisma.telegramChat.findMany({
    where: { connectionId, isActive: true },
  });
  for (const c of chats) {
    try {
      await sendNotification(botToken, c.chatId, type, data);
    } catch {
      /* ignore */
    }
  }
}

export async function registerChat(
  connectionId: string,
  chatId: string,
  chatType: string,
  title: string | null,
  userId?: string | null,
): Promise<void> {
  await prisma.telegramChat.upsert({
    where: {
      chatId_connectionId: { chatId, connectionId },
    },
    create: {
      chatId,
      chatType,
      title,
      connectionId,
      userId: userId ?? null,
      isActive: true,
    },
    update: {
      title,
      userId: userId ?? undefined,
      isActive: true,
    },
  });
}
