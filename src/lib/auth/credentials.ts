import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials ?? initialsFromName(user.name),
  };
}
