import { notFound } from "next/navigation";
import { loadShareContext } from "@/lib/org/public-share";
import { PublicShareShell } from "./PublicShareShell";

export const dynamic = "force-dynamic";

export default async function PublicShareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  const ctx = await loadShareContext(params.token);
  if (!ctx || ctx.sections.length === 0) {
    notFound();
  }

  return (
    <PublicShareShell
      token={params.token}
      orgName={ctx.orgName}
      sections={ctx.sections}
    >
      {children}
    </PublicShareShell>
  );
}
