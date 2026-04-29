// Не import "server-only": модуль транзитивно вытаскивается в клиентский бандл
// через context.ts → bitrix-facts.ts → PlanPageClient. Tree-shaking уберёт
// prisma из клиентского бандла, потому что resolveOrgId() / share-helpers
// никогда не вызываются клиентом. Для генерации токена используем Web Crypto
// (globalThis.crypto.getRandomValues), который работает и в Node 20+, и в браузере,
// и не использует node:* URI, на которые webpack ругается в client bundle.
import { prisma } from "@/lib/prisma";
import { isShareSection, type ShareSection } from "@/lib/org/public-share-shared";

export {
  SHARE_TOKEN_HEADER,
  SHARE_SECTIONS,
  SHARE_SECTION_LABELS,
  isShareSection,
} from "@/lib/org/public-share-shared";
export type { ShareSection } from "@/lib/org/public-share-shared";

/** Сгенерировать новый случайный токен (URL-safe, 32 символа). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  // base64 → URL-safe замены, обрезаем до 32 символов
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64
    .replace(/\+/g, "A")
    .replace(/\//g, "B")
    .replace(/=+$/g, "")
    .slice(0, 32);
}

/**
 * Проверяет токен и возвращает orgId, если публикация включена.
 * Возвращает null если токен невалиден / публикация выключена.
 */
export async function resolveOrgIdFromShareToken(
  token: string,
): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const org = await prisma.organization.findUnique({
    where: { publicShareToken: trimmed },
    select: { id: true, publicShareEnabled: true },
  });
  if (!org || !org.publicShareEnabled) return null;
  return org.id;
}

/** Получить полную публичную конфигурацию по токену (страница /p/[token]). */
export async function loadShareContext(token: string): Promise<{
  orgId: string;
  orgName: string;
  sections: ShareSection[];
} | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const org = await prisma.organization.findUnique({
    where: { publicShareToken: trimmed },
    select: {
      id: true,
      name: true,
      publicShareEnabled: true,
      publicShareSections: true,
    },
  });
  if (!org || !org.publicShareEnabled) return null;
  const sections = (org.publicShareSections ?? []).filter(isShareSection);
  return { orgId: org.id, orgName: org.name, sections };
}
