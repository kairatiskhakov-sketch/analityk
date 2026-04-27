import bcrypt from "bcryptjs";
import type { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEmailPlatformAdmin } from "@/lib/admin/platform-admin";
import { writePlatformAudit, PlatformAuditAction } from "@/lib/admin/audit";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>>,
) {
  if (!credentials?.email || !credentials?.password) return null;

  const email = String(credentials.email).trim().toLowerCase();
  const password = String(credentials.password);

  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  // BLOCKED — не пускаем (можно различать причину в UI на странице логина,
  // но для безопасности возвращаем null как при неверном пароле).
  if (user.status === "BLOCKED") return null;

  // Bootstrap super-admin: email в PLATFORM_ADMIN_EMAILS — выдаём флаг и активируем.
  // БД — источник истины, env только инициирует.
  let status: UserStatus = user.status;
  let isPlatformAdmin: boolean = user.isPlatformAdmin;
  if (isEmailPlatformAdmin(email) && (!user.isPlatformAdmin || user.status !== "ACTIVE")) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isPlatformAdmin: true,
        status: "ACTIVE",
        approvedAt: user.approvedAt ?? new Date(),
      },
      select: { status: true, isPlatformAdmin: true },
    });
    status = updated.status;
    isPlatformAdmin = updated.isPlatformAdmin;
    await writePlatformAudit({
      actorId: user.id,
      action: PlatformAuditAction.ADMIN_GRANTED,
      targetId: user.id,
      details: { source: "bootstrap-env" },
    });
  }

  // lastLoginAt — best-effort, не блокирует логин
  prisma.user
    .update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    .catch(() => {});

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials ?? initialsFromName(user.name),
    status,
    isPlatformAdmin,
  };
}
