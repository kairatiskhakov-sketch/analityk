import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }

    const updated = await prisma.telegramConnection.update({
      where: { id: body.connectionId },
      data: {
        isActive: false,
        botToken: encrypt(""),
      },
    });

    await prisma.telegramChat.updateMany({
      where: { connectionId: body.connectionId },
      data: { isActive: false },
    });

    return jsonOk({ connection: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
