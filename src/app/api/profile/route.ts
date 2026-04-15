import { auth } from "@/auth";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  telegramId?: string | null;
};

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonError("Требуется вход", 401);
    }

    const body = (await req.json()) as Body;
    const name = (body.name ?? "").trim();
    if (!name) {
      return jsonError("Имя обязательно", 400);
    }

    const telegramIdRaw = typeof body.telegramId === "string" ? body.telegramId.trim() : null;
    const telegramId = telegramIdRaw && telegramIdRaw.length > 0 ? telegramIdRaw : null;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        telegramId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        telegramId: true,
      },
    });

    return jsonOk({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось обновить профиль";
    return jsonError(msg, 500);
  }
}
