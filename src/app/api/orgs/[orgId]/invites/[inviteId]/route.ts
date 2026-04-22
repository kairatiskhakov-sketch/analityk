import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/orgs/:orgId/invites/:inviteId — отозвать приглашение.
 * Только OWNER/ADMIN. Помечаем revokedAt, токен перестаёт работать.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { orgId: string; inviteId: string } },
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

  const invite = await prisma.orgInvite.findUnique({
    where: { id: params.inviteId },
  });
  if (!invite || invite.orgId !== params.orgId) {
    return jsonError("Приглашение не найдено", 404);
  }

  if (invite.acceptedAt) {
    return jsonError("Приглашение уже принято, отозвать нельзя", 409);
  }

  if (!invite.revokedAt) {
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
  }

  return jsonOk({ revokedInviteId: invite.id });
}
