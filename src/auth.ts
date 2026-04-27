import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Role, UserStatus } from "@prisma/client";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const { authorizeCredentials } = await import("@/lib/auth/credentials");
        return authorizeCredentials(credentials);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as {
          id: string;
          role: Role;
          initials?: string | null;
          status?: UserStatus;
          isPlatformAdmin?: boolean;
        };
        token.role = u.role;
        token.id = u.id;
        token.initials = u.initials ?? initialsFromName(user.name ?? "");
        token.status = u.status ?? "ACTIVE";
        token.isPlatformAdmin = u.isPlatformAdmin ?? false;

        // Resolve org on sign-in: prefer user's currentOrgId, else first membership.
        try {
          const { prisma } = await import("@/lib/prisma");
          const dbUser = await prisma.user.findUnique({
            where: { id: u.id },
            select: { currentOrgId: true },
          });
          let orgId: string | null = dbUser?.currentOrgId ?? null;
          if (!orgId) {
            const membership = await prisma.orgMember.findFirst({
              where: { userId: u.id },
              select: { orgId: true },
            });
            orgId = membership?.orgId ?? null;
          }
          token.currentOrgId = orgId;
        } catch {
          token.currentOrgId = null;
        }
      }

      // Refresh from DB when client calls update() (org switcher / status change).
      if (trigger === "update" && token.id) {
        try {
          const { prisma } = await import("@/lib/prisma");
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              currentOrgId: true,
              status: true,
              isPlatformAdmin: true,
            },
          });
          token.currentOrgId = dbUser?.currentOrgId ?? null;
          if (dbUser) {
            token.status = dbUser.status;
            token.isPlatformAdmin = dbUser.isPlatformAdmin;
          }
        } catch {
          /* keep previous values */
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.initials = (token.initials as string) ?? "";
        session.user.currentOrgId =
          (token.currentOrgId as string | null | undefined) ?? null;
        session.user.status =
          (token.status as UserStatus | undefined) ?? "ACTIVE";
        session.user.isPlatformAdmin =
          (token.isPlatformAdmin as boolean | undefined) ?? false;
      }
      return session;
    },
  },
});
