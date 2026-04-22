import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuditAction, writeAudit } from "@/lib/org/audit";

export const dynamic = "force-dynamic";

type Role = "OWNER" | "ADMIN" | "VIEWER";

async function requireOrgAccess(orgId: string, userId: string) {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  return membership;
}

/**
 * GET /api/orgs/:orgId/members — список участников организации.
 * Доступен всем членам org.
 */
export async function GET(
  _req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const membership = await requireOrgAccess(params.orgId, user.id);
  if (!membership) return jsonError("Нет доступа", 403);

  const members = await prisma.orgMember.findMany({
    where: { orgId: params.orgId },
    include: {
      user: {
        select: { id: true, name: true, email: true, initials: true, image: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return jsonOk({
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      name: m.user.name,
      email: m.user.email,
      initials: m.user.initials,
      image: m.user.image,
      isCurrent: m.userId === user.id,
    })),
    currentUserRole: membership.role,
  });
}

/**
 * POST /api/orgs/:orgId/members { email, role? } — добавить участника.
 * Только OWNER/ADMIN. Пользователь с таким email должен уже существовать.
 */
export async function POST(
  req: Request,
  { params }: { params: { orgId: string } },
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const membership = await requireOrgAccess(params.orgId, user.id);
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

  const email = body.email?.trim().toLowerCase();
  if (!email) return jsonError("Укажите email");
  const role: Role = body.role === "ADMIN" ? "ADMIN" : body.role === "OWNER" ? "OWNER" : "VIEWER";

  // Только OWNER может приглашать других OWNER
  if (role === "OWNER" && membership.role !== "OWNER") {
    return jsonError("Только владелец может добавлять других владельцев", 403);
  }

  const target = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, initials: true, image: true },
  });
  if (!target) return jsonError("Пользователь с таким email не найден");

  // Проверяем, не состоит ли уже
  const existing = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: target.id } },
  });
  if (existing) return jsonError("Пользователь уже в организации", 409);

  const created = await prisma.orgMember.create({
    data: {
      orgId: params.orgId,
      userId: target.id,
      role,
      invitedBy: user.id,
    },
  });

  await writeAudit({
    orgId: params.orgId,
    actorUserId: user.id,
    action: AuditAction.MEMBER_ADDED,
    targetUserId: target.id,
    targetEmail: target.email,
    details: { role },
  });

  return jsonOk({
    member: {
      id: created.id,
      userId: target.id,
      role: created.role,
      createdAt: created.createdAt.toISOString(),
      name: target.name,
      email: target.email,
      initials: target.initials,
      image: target.image,
      isCurrent: false,
    },
  });
}
