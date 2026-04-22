import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Role = "OWNER" | "ADMIN" | "VIEWER";

/**
 * PATCH /api/orgs/:orgId/members/:userId { role } — сменить роль участника.
 * Только OWNER/ADMIN. Только OWNER может назначать/снимать роль OWNER.
 * Нельзя убрать последнего OWNER.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { orgId: string; userId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const actor = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
  });
  if (!actor) return jsonError("Нет доступа", 403);
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    return jsonError("Недостаточно прав", 403);
  }

  let body: { role?: Role };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const nextRole: Role | undefined =
    body.role === "OWNER" || body.role === "ADMIN" || body.role === "VIEWER"
      ? body.role
      : undefined;
  if (!nextRole) return jsonError("Некорректная роль");

  const target = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: params.userId } },
  });
  if (!target) return jsonError("Участник не найден", 404);

  // OWNER-операции — только OWNER может их выполнять
  if ((target.role === "OWNER" || nextRole === "OWNER") && actor.role !== "OWNER") {
    return jsonError("Только владелец может менять роль владельца", 403);
  }

  // Нельзя понизить последнего OWNER
  if (target.role === "OWNER" && nextRole !== "OWNER") {
    const ownersCount = await prisma.orgMember.count({
      where: { orgId: params.orgId, role: "OWNER" },
    });
    if (ownersCount <= 1) {
      return jsonError("Нельзя понизить последнего владельца");
    }
  }

  const updated = await prisma.orgMember.update({
    where: { id: target.id },
    data: { role: nextRole },
  });

  return jsonOk({
    member: {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
    },
  });
}

/**
 * DELETE /api/orgs/:orgId/members/:userId — удалить участника из организации.
 * OWNER/ADMIN может удалять других (VIEWER/ADMIN), OWNER — любого.
 * Нельзя удалить последнего OWNER. Любой участник может выйти сам (soft-leave).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { orgId: string; userId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const actor = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
  });
  if (!actor) return jsonError("Нет доступа", 403);

  const target = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: params.userId } },
  });
  if (!target) return jsonError("Участник не найден", 404);

  const isSelf = target.userId === user.id;
  const canManage =
    actor.role === "OWNER" ||
    (actor.role === "ADMIN" && target.role !== "OWNER" && !isSelf);

  if (!isSelf && !canManage) {
    return jsonError("Недостаточно прав", 403);
  }

  // Нельзя удалить последнего OWNER
  if (target.role === "OWNER") {
    const ownersCount = await prisma.orgMember.count({
      where: { orgId: params.orgId, role: "OWNER" },
    });
    if (ownersCount <= 1) {
      return jsonError("Нельзя удалить последнего владельца");
    }
  }

  await prisma.orgMember.delete({ where: { id: target.id } });

  // Если юзер удалил себя из текущей org — сбрасываем currentOrgId
  if (isSelf && user.currentOrgId === params.orgId) {
    const otherMembership = await prisma.orgMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { orgId: true },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { currentOrgId: otherMembership?.orgId ?? null },
    });
  }

  return jsonOk({ removedUserId: params.userId });
}
