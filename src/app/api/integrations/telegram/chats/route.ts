import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    if (!connectionId) {
      return jsonError("Нужен connectionId");
    }

    const orgId = await resolveOrgId();
    const conn = await prisma.telegramConnection.findUnique({
      where: { id: connectionId },
      select: { orgId: true },
    });
    if (!conn || conn.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }

    const chats = await prisma.telegramChat.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({ chats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
