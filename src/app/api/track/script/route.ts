import { buildTrackingSnippet } from "@/lib/tracking/snippet";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/track/script?k=<trackingKey>
 * Отдаёт JS-сниппет для встраивания в лендинг клиента.
 *   <script src="https://analytics.example.com/api/track/script?k=KEY" async></script>
 *
 * Content-Type: application/javascript. CORS открыт. Кеш 5 минут на уровне CDN.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("k")?.trim();
  if (!key) {
    return new Response("/* trackingKey отсутствует */", {
      status: 400,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  // Валидируем ключ. Если не найден — отдаём no-op снипет (чтобы не блокировать лендинг клиента).
  const org = await prisma.organization.findUnique({
    where: { trackingKey: key },
    select: { id: true },
  });
  if (!org) {
    return new Response("/* unknown trackingKey */", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const origin = new URL(req.url).origin;
  const body = buildTrackingSnippet({ baseUrl: origin, trackingKey: key });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
