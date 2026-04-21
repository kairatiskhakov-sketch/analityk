import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function slugify(raw: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };
  let out = "";
  for (const ch of raw.trim().toLowerCase()) out += map[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

async function uniqueSlug(base: string): Promise<string> {
  let s = base;
  for (let i = 2; i < 100; i += 1) {
    const e = await prisma.organization.findUnique({ where: { slug: s }, select: { id: true } });
    if (!e) return s;
    s = `${base}-${i}`;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/** GET /api/orgs — список организаций, где состоит текущий пользователь. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  const orgs = memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    plan: m.org.plan,
    role: m.role,
    isCurrent: m.orgId === user.currentOrgId,
  }));

  return jsonOk({ orgs, currentOrgId: user.currentOrgId });
}

/** POST /api/orgs { name } — создать новую организацию (юзер становится OWNER). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Не авторизован", 401);

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON");
  }

  const name = body.name?.trim();
  if (!name) return jsonError("Укажите название организации");
  if (name.length > 120) return jsonError("Слишком длинное название");

  const slug = await uniqueSlug(slugify(name));

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: { name, slug, plan: "free" },
    });
    await tx.orgMember.create({
      data: { orgId: created.id, userId: user.id, role: "OWNER" },
    });
    // Автоматически переключаем пользователя на новую org
    await tx.user.update({
      where: { id: user.id },
      data: { currentOrgId: created.id },
    });
    return created;
  });

  return jsonOk({ org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan, role: "OWNER", isCurrent: true } });
}
