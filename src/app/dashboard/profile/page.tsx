import { auth } from "@/auth";
import { ProfilePageClient } from "@/components/profile/profile-page-client";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      initials: true,
      telegramId: true,
    },
  });
  if (!user) {
    redirect("/login");
  }

  return (
    <ProfilePageClient
      initialUser={{
        name: user.name,
        email: user.email,
        role: user.role,
        initials: user.initials || initialsFromName(user.name) || "П",
        telegramId: user.telegramId,
      }}
    />
  );
}
