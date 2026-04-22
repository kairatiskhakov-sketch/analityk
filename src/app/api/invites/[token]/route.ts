import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/invites/:token — публичная информация о приглашении.
 * Возвращает название организации и email, для которого создан инвайт.
 * Не раскрывает ID/роли если инвайт невалиден.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const token = params.token;
  if (!token || token.length < 20) return jsonError("Невалидный токен", 400);

  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    include: {
      org: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invite) return jsonError("Приглашение не найдено", 404);

  const now = new Date();
  const status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" =
    invite.acceptedAt
      ? "ACCEPTED"
      : invite.revokedAt
        ? "REVOKED"
        : invite.expiresAt <= now
          ? "EXPIRED"
          : "PENDING";

  const user = await getSessionUser();
  const emailMatches =
    !!user?.email && user.email.toLowerCase() === invite.email.toLowerCase();

  return jsonOk({
    invite: {
      email: invite.email,
      role: invite.role,
      status,
      expiresAt: invite.expiresAt.toISOString(),
      org: { id: invite.org.id, name: invite.org.name, slug: invite.org.slug },
    },
    session: {
      authenticated: Boolean(user),
      userEmail: user?.email ?? null,
      emailMatches,
    },
  });
}
