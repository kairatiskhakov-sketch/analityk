import { auth } from "@/auth";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "MANAGER";
  initials?: string | null;
  currentOrgId: string | null;
};

/** Возвращает session.user (нормализованный) или null если не авторизован. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u || !("id" in u) || !u.id) return null;
  return {
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
    role: u.role,
    initials: u.initials ?? null,
    currentOrgId: u.currentOrgId ?? null,
  };
}
