export const MODULES = [
  { key: "overview_stats", name: "Общая статистика", page: "dashboard", default: true },
  {
    key: "financial_stats",
    name: "Финансовая статистика",
    page: "dashboard",
    default: true,
  },
  { key: "sources_chart", name: "Источники лидов", page: "dashboard", default: true },
  { key: "fails_chart", name: "Причины отказов", page: "dashboard", default: true },
  {
    key: "funnels_detail",
    name: "Детализация по воронкам",
    page: "dashboard",
    default: true,
  },
  { key: "plan_progress", name: "Прогресс плана", page: "dashboard", default: true },
  { key: "ads_roi", name: "ROI рекламы", page: "dashboard", default: true },

  { key: "managers_rating", name: "Рейтинг менеджеров", page: "managers", default: true },
  {
    key: "managers_dynamics",
    name: "Динамика по менеджерам",
    page: "managers",
    default: true,
  },
  { key: "managers_assort", name: "Менеджеры × Товары", page: "managers", default: false },

  { key: "leads_funnel", name: "Воронка лидов", page: "leads", default: true },
  { key: "leads_sources", name: "Каналы лидов", page: "leads", default: true },
  { key: "leads_fails", name: "Провалы", page: "leads", default: true },
  { key: "leads_feed", name: "Лента лидов", page: "leads", default: true },

  { key: "products_top", name: "Топ товаров", page: "products", default: false },
  { key: "products_abc_xyz", name: "ABC/XYZ матрица", page: "products", default: false },
  { key: "products_seasonal", name: "Сезонность", page: "products", default: false },

  { key: "regions_map", name: "Карта регионов", page: "regions", default: false },
  { key: "regions_table", name: "Таблица по городам", page: "regions", default: false },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export type ModulePage = (typeof MODULES)[number]["page"];
