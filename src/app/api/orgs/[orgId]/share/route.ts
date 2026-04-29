import { jsonError, jsonOk } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  generateShareToken,
  isShareSection,
  SHARE_SECTIONS,
} from "@/lib/org/public-share";

export const dynamic = "force-dynamic";

async function ensureOwnerOrAdmin(orgId: string, userId: string) {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  if (!membership) return null;
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return null;
  return membership;
}

/** GET — текущая конфигурация публичной ссылки. */
export async function GET(
  _req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);
  const ok = await ensureOwnerOrAdmin(params.orgId, user.id);
  if (!ok) return jsonError("Нет доступа", 403);

  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: {
      publicShareToken: true,
      publicShareEnabled: true,
      publicShareSections: true,
    },
  });
  if (!org) return jsonError("Организация не найдена", 404);
  return jsonOk({
    token: org.publicShareToken,
    enabled: org.publicShareEnabled,
    sections: (org.publicShareSections ?? []).filter(isShareSection),
    availableSections: SHARE_SECTIONS,
  });
}

/**
 * PATCH — обновить публичную ссылку.
 * body: { enabled?: boolean, sections?: string[], regenerate?: boolean }
 * - regenerate: true → выпускает новый токен (старый перестаёт работать).
 * - При первом включении (enabled=true) если токен не сгенерирован — создаётся.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);
  const ok = await ensureOwnerOrAdmin(params.orgId, user.id);
  if (!ok) return jsonError("Нет доступа", 403);

  let body: {
    enabled?: boolean;
    sections?: string[];
    regenerate?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Некорректный JSON");
  }

  const data: {
    publicShareEnabled?: boolean;
    publicShareSections?: string[];
    publicShareToken?: string | null;
  } = {};

  const current = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: {
      publicShareToken: true,
      publicShareEnabled: true,
      publicShareSections: true,
    },
  });
  if (!current) return jsonError("Организация не найдена", 404);

  if (typeof body.enabled === "boolean") {
    data.publicShareEnabled = body.enabled;
  }
  if (Array.isArray(body.sections)) {
    const filtered = body.sections.filter(isShareSection);
    data.publicShareSections = Array.from(new Set(filtered));
  }
  if (body.regenerate || (data.publicShareEnabled && !current.publicShareToken)) {
    // выпускаем уникальный токен (на коллизию повторяем)
    let attempts = 0;
    while (attempts < 5) {
      const candidate = generateShareToken();
      const exists = await prisma.organization.findUnique({
        where: { publicShareToken: candidate },
        select: { id: true },
      });
      if (!exists) {
        data.publicShareToken = candidate;
        break;
      }
      attempts += 1;
    }
    if (!data.publicShareToken) {
      return jsonError("Не удалось сгенерировать токен", 500);
    }
  }

  const updated = await prisma.organization.update({
    where: { id: params.orgId },
    data,
    select: {
      publicShareToken: true,
      publicShareEnabled: true,
      publicShareSections: true,
    },
  });

  return jsonOk({
    token: updated.publicShareToken,
    enabled: updated.publicShareEnabled,
    sections: (updated.publicShareSections ?? []).filter(isShareSection),
    availableSections: SHARE_SECTIONS,
  });
}

/** DELETE — отключить публикацию и сбросить токен. */
export async function DELETE(
  _req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);
  const ok = await ensureOwnerOrAdmin(params.orgId, user.id);
  if (!ok) return jsonError("Нет доступа", 403);

  await prisma.organization.update({
    where: { id: params.orgId },
    data: {
      publicShareEnabled: false,
      publicShareToken: null,
      publicShareSections: [],
    },
  });
  return jsonOk({ ok: true });
}
