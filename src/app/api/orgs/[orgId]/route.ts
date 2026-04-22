import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuditAction, writeAudit } from "@/lib/org/audit";
import { createLogger } from "@/lib/log/logger";

const log = createLogger("org.lifecycle");

export const dynamic = "force-dynamic";

/** PATCH /api/orgs/:orgId { name } — переименование организации (OWNER/ADMIN). */
export async function PATCH(
  req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
  });
  if (!membership) return jsonError("Нет доступа", 403);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return jsonError("Недостаточно прав", 403);
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const name = body.name?.trim();
  if (!name) return jsonError("Укажите название");
  if (name.length > 120) return jsonError("Слишком длинное название");

  const before = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { name: true },
  });

  const org = await prisma.organization.update({
    where: { id: params.orgId },
    data: { name },
  });

  if (before?.name !== org.name) {
    await writeAudit({
      orgId: params.orgId,
      actorUserId: user.id,
      action: AuditAction.ORG_RENAMED,
      details: { from: before?.name ?? null, to: org.name },
    });
  }

  return jsonOk({ org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan } });
}

/**
 * DELETE /api/orgs/:orgId — удалить организацию. Только OWNER.
 * Защита от мискликов: body `{ confirmSlug }` должен совпадать со slug org.
 * Каскад (FK onDelete: Cascade в schema.prisma) сносит все tenant-таблицы.
 * User.currentOrgId не имеет FK — нулим вручную у всех, у кого он указывал сюда.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
  });
  if (!membership) return jsonError("Нет доступа", 403);
  if (membership.role !== "OWNER") {
    return jsonError("Только владелец может удалить организацию", 403);
  }

  let body: { confirmSlug?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { id: true, slug: true },
  });
  if (!org) return jsonError("Организация не найдена", 404);

  const confirm = body.confirmSlug?.trim();
  if (!confirm || confirm !== org.slug) {
    return jsonError(
      "Подтверждение не совпадает: передайте confirmSlug равный slug организации",
      400,
    );
  }

  // OrgAudit каскадно удалится вместе с организацией — пишем событие удаления
  // в структурированный лог (а не в OrgAudit), чтобы оно сохранилось.
  log.info("deleted", {
    action: AuditAction.ORG_DELETED,
    orgId: org.id,
    slug: org.slug,
    actorUserId: user.id,
  });

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { currentOrgId: params.orgId },
      data: { currentOrgId: null },
    }),
    prisma.organization.delete({ where: { id: params.orgId } }),
  ]);

  return jsonOk({ ok: true, deleted: { id: org.id, slug: org.slug } });
}
