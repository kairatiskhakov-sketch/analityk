import type TelegramBot from "node-telegram-bot-api";

export function mainMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📊 Статистика", callback_data: "tg:stats:today" },
        { text: "📋 Лиды сегодня", callback_data: "tg:leads:today" },
      ],
      [{ text: "👥 Менеджеры", callback_data: "tg:managers" }],
      [{ text: "📅 План", callback_data: "tg:plan" }],
    ],
  };
}

export function statsPeriodKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "За неделю", callback_data: "tg:stats:week" },
        { text: "За месяц", callback_data: "tg:stats:month" },
      ],
      [{ text: "🔄 Обновить", callback_data: "tg:stats:today" }],
    ],
  };
}

export function leadsPeriodKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Сегодня", callback_data: "tg:leads:today" },
        { text: "Неделя", callback_data: "tg:leads:week" },
        { text: "Месяц", callback_data: "tg:leads:month" },
      ],
    ],
  };
}
