import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/http/json";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { writePlatformAudit, PlatformAuditAction } from "@/lib/admin/audit";
import { sendEmail } from "@/lib/email/send";
import { buildAccountBlockedEmail } from "@/lib/email/templates/account-blocked";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = params;
  if (!id) return jsonError("id required", 400);

  if (id === gate.user.id) {
    return jsonError("Нельзя заблокировать самого себя", 400);
  }

  let body: { reason?: string };
  try {
    body = (await req.json()) as { reason?: string };
  } catch {
    body = {};
  }
  const reason = body.reason?.trim()?.slice(0, 500) || null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, status: true },
  });
  if (!user) return jsonError("Пользователь не найден", 404);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "BLOCKED",
      blockedAt: new Date(),
      blockedById: gate.user.id,
      blockReason: reason,
    },
    select: { id: true, name: true, email: true, status: true, blockedAt: true },
  });

  void writePlatformAudit({
    actorId: gate.user.id,
    action: PlatformAuditAction.USER_BLOCKED,
    targetId: id,
    details: { previousStatus: user.status, reason },
  });

  // Уведомление пользователю
  const tpl = buildAccountBlockedEmail({
    userName: updated.name,
    reason,
  });
  void sendEmail({
    to: updated.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  return jsonOk({
    user: {
      id: updated.id,
      status: updated.status,
      blockedAt: updated.blockedAt?.toISOString() ?? null,
      blockReason: reason,
    },
  });
}
