import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { runAttributionBackfill } from "@/lib/tracking/backfill";

export const dynamic = "force-dynamic";
// Может быть долгим — зависит от числа неатрибутированных сделок и CRM rate-limit.
export const maxDuration = 300;

/**
 * POST /api/orgs/:orgId/attribution/backfill
 * body: { crmType?: "bitrix24" | "amocrm", limit?: number }
 *
 * Ретро-матч LeadAttribution-строк без touchId. Доступен OWNER/ADMIN.
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

  let body: { crmType?: string; limit?: number } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const crmType =
    body.crmType === "bitrix24" || body.crmType === "amocrm"
      ? body.crmType
      : undefined;
  const limit =
    typeof body.limit === "number" && body.limit > 0 ? body.limit : undefined;

  const result = await runAttributionBackfill({
    orgId: params.orgId,
    crmType,
    limit,
  });

  return jsonOk({ result });
}
