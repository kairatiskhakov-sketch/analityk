import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/http/json";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { writePlatformAudit, PlatformAuditAction } from "@/lib/admin/audit";
import { sendEmail } from "@/lib/email/send";
import { buildAccountApprovedEmail } from "@/lib/email/templates/account-approved";

export const dynamic = "force-dynamic";

function getPublicBaseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = params;
  if (!id) return jsonError("id required", 400);

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, status: true },
  });
  if (!user) return jsonError("Пользователь не найден", 404);
  if (user.status === "ACTIVE") {
    return jsonOk({ user: { id: user.id, status: "ACTIVE" }, alreadyActive: true });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "ACTIVE",
      approvedAt: new Date(),
      approvedById: gate.user.id,
      // если ранее блокировали — снимаем
      blockedAt: null,
      blockedById: null,
      blockReason: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      approvedAt: true,
    },
  });

  void writePlatformAudit({
    actorId: gate.user.id,
    action: PlatformAuditAction.USER_APPROVED,
    targetId: id,
    details: { previousStatus: user.status },
  });

  // Уведомление пользователю
  const baseUrl = getPublicBaseUrl(req);
  const loginUrl = baseUrl ? `${baseUrl}/login` : "/login";
  const tpl = buildAccountApprovedEmail({
    userName: updated.name,
    loginUrl,
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
      approvedAt: updated.approvedAt?.toISOString() ?? null,
    },
  });
}
