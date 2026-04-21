import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/organization/tracking
 * Возвращает trackingKey текущей организации и готовый <script> для вставки
 * на лендинг клиента. Используется UI в настройках «Трекинг».
 */
export async function GET(req: Request) {
  try {
    const orgId = await resolveOrgId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, trackingKey: true },
    });
    if (!org) return jsonError("Организация не найдена", 404);

    const origin = new URL(req.url).origin;
    const scriptTag = `<script src="${origin}/api/track/script?k=${org.trackingKey}" async></script>`;
    return jsonOk({
      organization: { id: org.id, name: org.name },
      trackingKey: org.trackingKey,
      scriptTag,
      endpoint: `${origin}/api/track`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
