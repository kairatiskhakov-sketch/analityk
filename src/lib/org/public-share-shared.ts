/**
 * Изоморфные хелперы публичной ссылки. Никаких node-only API —
 * можно импортировать и из клиентских компонентов.
 */

export const SHARE_TOKEN_HEADER = "x-share-token";

export const SHARE_SECTIONS = [
  "dashboard",
  "marketing",
  "managers",
  "plan",
  "leads",
] as const;
export type ShareSection = (typeof SHARE_SECTIONS)[number];

export const SHARE_SECTION_LABELS: Record<ShareSection, string> = {
  dashboard: "Дашборд",
  marketing: "Маркетинг",
  managers: "Менеджеры",
  plan: "План / Факт",
  leads: "Лиды",
};

export function isShareSection(v: string): v is ShareSection {
  return (SHARE_SECTIONS as readonly string[]).includes(v);
}
