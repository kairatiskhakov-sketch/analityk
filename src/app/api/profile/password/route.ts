import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = {
  currentPassword?: string;
  newPassword?: string;
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonError("Требуется вход", 401);
    }

    const body = (await req.json()) as Body;
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";

    if (!currentPassword || !newPassword) {
      return jsonError("Заполните текущий и новый пароль", 400);
    }
    if (newPassword.length < 6) {
      return jsonError("Новый пароль должен быть не короче 6 символов", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });
    if (!user) {
      return jsonError("Пользователь не найден", 404);
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return jsonError("Текущий пароль неверный", 400);
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось изменить пароль";
    return jsonError(msg, 500);
  }
}
