import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/orgs/:orgId/audit?limit=&before= — чтение журнала аудита.
 *
 * Только OWNER/ADMIN. Keyset-пагинация по createdAt (ISO) через `before`.
 * Возвращает последние события, более свежие сверху.
 */
export async function GET(
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

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500)
    : 100;

  const beforeParam = url.searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : null;
  const whereCreated = before && !Number.isNaN(before.getTime())
    ? { lt: before }
    : undefined;

  const rows = await prisma.orgAudit.findMany({
    where: {
      orgId: params.orgId,
      ...(whereCreated ? { createdAt: whereCreated } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Разворачиваем имена/email авторов и целей одним батчем.
  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.actorUserId, r.targetUserId])
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, initials: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return jsonOk({
    events: rows.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      actorUserId: r.actorUserId,
      actor: r.actorUserId ? userMap.get(r.actorUserId) ?? null : null,
      targetUserId: r.targetUserId,
      target: r.targetUserId ? userMap.get(r.targetUserId) ?? null : null,
      targetEmail: r.targetEmail,
      targetInviteId: r.targetInviteId,
      details: r.details,
    })),
    nextCursor:
      rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null,
  });
}
