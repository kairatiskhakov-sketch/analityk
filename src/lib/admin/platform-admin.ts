/**
 * Помощники для платформенного super-admin'а.
 *
 * - `getPlatformAdminEmails()` — парсит env PLATFORM_ADMIN_EMAILS (через запятую).
 * - `isEmailPlatformAdmin(email)` — быстрый предикат для auth-пайплайна.
 *
 * Источник истины — БД (`User.isPlatformAdmin`). Env — это только bootstrap:
 * при логине юзера с email из списка мы автоматически ставим `isPlatformAdmin=true`
 * и `status=ACTIVE`. Снять флаг через env нельзя (только админ через UI или SQL).
 */

export function getPlatformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return getPlatformAdminEmails().includes(norm);
}
