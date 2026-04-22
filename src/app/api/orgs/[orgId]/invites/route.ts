import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import {
  INVITE_TTL_MS,
  buildInviteUrl,
  generateInviteToken,
  normalizeEmail,
} from "@/lib/org/invite-token";
import { sendEmail } from "@/lib/email/send";
import { buildInviteEmail } from "@/lib/email/templates/invite";

export const dynamic = "force-dynamic";

type Role = "OWNER" | "ADMIN" | "VIEWER";

/**
 * GET /api/orgs/:orgId/invites — список pending-приглашений.
 * Доступен OWNER/ADMIN.
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

  const now = new Date();
  const rows = await prisma.orgInvite.findMany({
    where: {
      orgId: params.orgId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  const origin = new URL(req.url).origin;
  return jsonOk({
    invites: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      url: buildInviteUrl(r.token, origin),
    })),
  });
}

/**
 * POST /api/orgs/:orgId/invites { email, role? } — создать приглашение.
 * Возвращает URL с токеном, который пользователь откроет и примет.
 * Только OWNER/ADMIN. OWNER-инвайт — только от OWNER.
 */
export async function POST(
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

  let body: { email?: string; role?: Role };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const email = normalizeEmail(body.email);
  if (!email) return jsonError("Укажите корректный email");

  const role: Role =
    body.role === "ADMIN"
      ? "ADMIN"
      : body.role === "OWNER"
        ? "OWNER"
        : "VIEWER";
  if (role === "OWNER" && membership.role !== "OWNER") {
    return jsonError("Только владелец может приглашать других владельцев", 403);
  }

  // Если email уже привязан к участнику org — сразу вернём ошибку.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    const exists = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: params.orgId, userId: existingUser.id } },
    });
    if (exists) return jsonError("Пользователь уже в организации", 409);
  }

  // Если уже есть активный pending-инвайт на этот email — переиспользуем его.
  const now = new Date();
  const active = await prisma.orgInvite.findFirst({
    where: {
      orgId: params.orgId,
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  let invite = active;
  let isNew = false;
  if (!invite) {
    invite = await prisma.orgInvite.create({
      data: {
        orgId: params.orgId,
        email,
        role,
        token: generateInviteToken(),
        invitedBy: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    isNew = true;
  } else if (invite.role !== role) {
    // Обновляем роль существующего инвайта, если попросили другую.
    invite = await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { role },
    });
  }

  // Отправляем письмо с ссылкой. Фолбэк — лог в консоль, если RESEND_API_KEY
  // не сконфигурирован. Ошибки не блокируют ответ — ссылка всё равно вернётся.
  const origin = new URL(req.url).origin;
  const inviteUrl = buildInviteUrl(invite.token, origin);

  let emailSent: boolean | null = null;
  let emailError: string | null = null;
  if (isNew || invite.role !== active?.role) {
    const org = await prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { name: true },
    });
    const tpl = buildInviteEmail({
      orgName: org?.name ?? "организацию",
      inviterName: user.name ?? user.email,
      role: invite.role,
      url: inviteUrl,
      expiresAt: invite.expiresAt,
    });
    const result = await sendEmail({
      to: invite.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    if (result.ok) {
      emailSent = result.skipped ? false : true;
    } else {
      emailSent = false;
      emailError = result.error;
    }
  }

  return jsonOk({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      url: inviteUrl,
    },
    emailSent,
    emailError,
  });
}
