/**
 * Гейт для всех /api/admin/* эндпоинтов.
 *
 * Использование:
 *   const gate = await requirePlatformAdmin();
 *   if (!gate.ok) return gate.response;
 *   const user = gate.user;
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export type AdminGate =
  | { ok: true; user: { id: string; email: string | null; name: string | null } }
  | { ok: false; response: NextResponse };

export async function requirePlatformAdmin(): Promise<AdminGate> {
  const session = await getSessionUser();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Не авторизован" },
        { status: 401 },
      ),
    };
  }
  // Флаг храним в БД — читаем свежий (не из JWT, чтобы revoke действовал сразу)
  const u = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      isPlatformAdmin: true,
      status: true,
    },
  });
  if (!u || !u.isPlatformAdmin || u.status !== "ACTIVE") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Недостаточно прав" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user: { id: u.id, email: u.email, name: u.name } };
}
