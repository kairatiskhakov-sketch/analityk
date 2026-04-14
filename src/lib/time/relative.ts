/** «X мин назад» для UI статусов синхронизации */
export function formatRelativeRu(d: Date | string | null | undefined): string {
  if (d == null) return "нет данных";
  const date = typeof d === "string" ? new Date(d) : d;
  const t = date.getTime();
  if (Number.isNaN(t)) return "нет данных";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "только что";
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
  return `${Math.floor(sec / 86400)} дн назад`;
}
