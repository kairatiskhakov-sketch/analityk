import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/http/json";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { writePlatformAudit, PlatformAuditAction } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = params;
  if (!id) return jsonError("id required", 400);

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, status: true, approvedAt: true },
  });
  if (!user) return jsonError("Пользователь не найден", 404);
  if (user.status !== "BLOCKED") {
    return jsonError("Пользователь не в статусе BLOCKED", 400);
  }

  // Возвращаем в ACTIVE (был ранее одобрен раз blocked → значит был ACTIVE)
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "ACTIVE",
      blockedAt: null,
      blockedById: null,
      blockReason: null,
      // если approvedAt не было — ставим сейчас
      approvedAt: user.approvedAt ?? new Date(),
      approvedById: user.approvedAt ? undefined : gate.user.id,
    },
    select: { id: true, status: true },
  });

  void writePlatformAudit({
    actorId: gate.user.id,
    action: PlatformAuditAction.USER_UNBLOCKED,
    targetId: id,
    details: { previousStatus: "BLOCKED" },
  });

  return jsonOk({ user: { id: updated.id, status: updated.status } });
}
