import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/orgs/switch { orgId } — переключает currentOrgId пользователя. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  let body: { orgId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const orgId = body.orgId?.trim();
  if (!orgId) return jsonError("orgId обязателен");

  // Юзер должен быть членом org
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: user.id } },
    include: { org: true },
  });
  if (!membership) return jsonError("Нет доступа к этой организации", 403);

  await prisma.user.update({
    where: { id: user.id },
    data: { currentOrgId: orgId },
  });

  return jsonOk({
    org: {
      id: membership.org.id,
      name: membership.org.name,
      slug: membership.org.slug,
      plan: membership.org.plan,
      role: membership.role,
    },
  });
}
