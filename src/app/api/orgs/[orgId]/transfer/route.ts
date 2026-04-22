import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuditAction, writeAudit } from "@/lib/org/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/orgs/:orgId/transfer { userId, demoteSelf? }
 *
 * Передача владения. Только OWNER. В одной транзакции:
 *  1) целевой пользователь становится OWNER (должен быть действующим участником),
 *  2) (опц.) текущий OWNER понижается до ADMIN.
 *
 * Мульти-OWNER разрешён (см. members/[userId] route — last-owner guard),
 * поэтому demoteSelf=false просто добавляет OWNER'а, не удаляя текущего.
 */
export async function POST(
  req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const me = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
  });
  if (!me) return jsonError("Нет доступа", 403);
  if (me.role !== "OWNER") return jsonError("Только владелец может передавать права", 403);

  let body: { userId?: string; demoteSelf?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const targetUserId = body.userId?.trim();
  if (!targetUserId) return jsonError("Укажите userId");
  if (targetUserId === user.id) {
    return jsonError("Нельзя передать владение самому себе");
  }

  const target = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: targetUserId } },
  });
  if (!target) return jsonError("Пользователь не состоит в организации", 404);

  const demoteSelf = body.demoteSelf === true;

  // Если demoteSelf и target уже OWNER — просто понизим себя.
  // Если target уже OWNER и demoteSelf=false — noop, возвращаем текущее состояние.
  if (target.role === "OWNER" && !demoteSelf) {
    return jsonOk({
      ok: true,
      target: { userId: target.userId, role: target.role },
      self: { userId: me.userId, role: me.role },
      note: "Пользователь уже владелец",
    });
  }

  const ops = [];
  if (target.role !== "OWNER") {
    ops.push(
      prisma.orgMember.update({
        where: { orgId_userId: { orgId: params.orgId, userId: targetUserId } },
        data: { role: "OWNER" },
      }),
    );
  }
  if (demoteSelf) {
    ops.push(
      prisma.orgMember.update({
        where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
        data: { role: "ADMIN" },
      }),
    );
  }

  await prisma.$transaction(ops);

  await writeAudit({
    orgId: params.orgId,
    actorUserId: user.id,
    action: AuditAction.OWNERSHIP_TRANSFERRED,
    targetUserId,
    details: { demoteSelf, previousTargetRole: target.role },
  });

  return jsonOk({
    ok: true,
    target: { userId: targetUserId, role: "OWNER" },
    self: { userId: user.id, role: demoteSelf ? "ADMIN" : "OWNER" },
  });
}
