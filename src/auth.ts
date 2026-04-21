import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Role } from "@prisma/client";

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
        };
        token.role = u.role;
        token.id = u.id;
        token.initials = u.initials ?? initialsFromName(user.name ?? "");

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

      // Refresh currentOrgId when client calls update() (e.g. org switcher).
      if (trigger === "update" && token.id) {
        try {
          const { prisma } = await import("@/lib/prisma");
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { currentOrgId: true },
          });
          token.currentOrgId = dbUser?.currentOrgId ?? null;
        } catch {
          /* keep previous value */
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
      }
      return session;
    },
  },
});
