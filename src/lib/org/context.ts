/**
 * Tenant context helpers.
 *
 * До полной миграции на мульти-тенантность используем одну дефолтную org
 * (id фиксирован в SQL миграции). Позже этот файл станет точкой входа
 * для извлечения orgId из NextAuth-сессии.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgIdFromShareToken } from "@/lib/org/public-share";
import { SHARE_TOKEN_HEADER } from "@/lib/org/public-share-shared";

/// Фиксированный id дефолтной организации из миграции 20260420120000_multi_tenancy_and_ads
export const DEFAULT_ORG_ID = "org_default_0001";

/**
 * Динамическое чтение request headers без статического импорта next/headers,
 * чтобы этот модуль не попал в client bundle через транзитивные импорты.
 * (`bitrix-facts.ts` → `won-stages.ts` → `context.ts`, и `bitrix-facts.ts`
 * импортируется из клиентского `PlanPageClient`.)
 */
function readShareTokenFromRequestHeaders(): string | null {
  try {
    const req: NodeRequire = (Function("return require") as () => NodeRequire)();
    const mod = req("next/headers") as typeof import("next/headers");
    return mod.headers().get(SHARE_TOKEN_HEADER);
  } catch {
    return null;
  }
}

/**
 * Возвращает orgId для текущего контекста.
 * Приоритет: x-share-token (публичная ссылка) → JWT-сессия → membership → DEFAULT.
 * Используется API-роутами и сервисными хелперами.
 */
export async function resolveOrgId(): Promise<string> {
  // 1. Публичная ссылка (read-only). Токен валиден только если публикация включена.
  const shareToken = readShareTokenFromRequestHeaders();
  if (shareToken) {
    const orgId = await resolveOrgIdFromShareToken(shareToken);
    if (orgId) return orgId;
  }

  try {
    const session = await auth();
    // JWT сессия уже содержит currentOrgId (выставляется в auth.ts) — без похода в БД
    const fromSession = session?.user?.currentOrgId;
    if (fromSession) return fromSession;

    const userId = session?.user && "id" in session.user ? (session.user as { id?: string }).id : null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentOrgId: true },
      });
      if (user?.currentOrgId) return user.currentOrgId;
      // Если currentOrgId не установлен — берём первый OrgMember
      const membership = await prisma.orgMember.findFirst({
        where: { userId },
        select: { orgId: true },
      });
      if (membership?.orgId) return membership.orgId;
    }
  } catch {
    // При вызове вне контекста NextAuth (webhook, cron) auth() может бросить.
    // Фоллбэк на дефолтную org.
  }
  return DEFAULT_ORG_ID;
}

/**
 * Синхронный фоллбэк для мест, где нельзя использовать async (например, тот же
 * webhook без сессии). В мульти-тенантном будущем все вызовы должны идти через
 * resolveOrgId(), а этот хелпер оставим только для bootstrapping / тестов.
 */
export function getDefaultOrgId(): string {
  return DEFAULT_ORG_ID;
}
