import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuditAction, writeAudit } from "@/lib/org/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/invites/:token/accept — принять приглашение.
 * Требует залогиненного пользователя. Email пользователя должен совпадать
 * с email инвайта. Создаёт OrgMember и переключает currentOrgId.
 */
export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const token = params.token;
  if (!token) return jsonError("Невалидный токен", 400);

  const invite = await prisma.orgInvite.findUnique({
    where: { token },
  });
  if (!invite) return jsonError("Приглашение не найдено", 404);
  if (invite.acceptedAt) return jsonError("Уже принято", 409);
  if (invite.revokedAt) return jsonError("Приглашение отозвано", 410);
  if (invite.expiresAt <= new Date()) {
    return jsonError("Срок приглашения истёк", 410);
  }

  // Email сессии должен совпадать с email инвайта
  const sessionEmail = (user.email ?? "").toLowerCase();
  if (!sessionEmail || sessionEmail !== invite.email.toLowerCase()) {
    return jsonError(
      "Email в приглашении не совпадает с вашим аккаунтом",
      403,
    );
  }

  // Уже в организации — помечаем инвайт как принятый и возвращаем успех.
  const existing = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
  });

  const result = await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.orgMember.create({
        data: {
          orgId: invite.orgId,
          userId: user.id,
          role: invite.role,
          invitedBy: invite.invitedBy,
        },
      });
    }
    await tx.orgInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedBy: user.id },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { currentOrgId: invite.orgId },
    });
    const org = await tx.organization.findUnique({
      where: { id: invite.orgId },
      select: { id: true, name: true, slug: true, plan: true },
    });
    return org;
  });

  await writeAudit({
    orgId: invite.orgId,
    actorUserId: user.id,
    action: AuditAction.INVITE_ACCEPTED,
    targetInviteId: invite.id,
    targetUserId: user.id,
    targetEmail: invite.email,
    details: { role: invite.role, wasExisting: Boolean(existing) },
  });

  return jsonOk({
    org: result,
    role: invite.role,
  });
}
