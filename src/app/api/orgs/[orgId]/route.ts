import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** PATCH /api/orgs/:orgId { name } — переименование организации (OWNER/ADMIN). */
export async function PATCH(
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

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const name = body.name?.trim();
  if (!name) return jsonError("Укажите название");
  if (name.length > 120) return jsonError("Слишком длинное название");

  const org = await prisma.organization.update({
    where: { id: params.orgId },
    data: { name },
  });

  return jsonOk({ org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan } });
}
