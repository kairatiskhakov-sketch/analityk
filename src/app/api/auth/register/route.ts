import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateTrackingKey } from "@/lib/tracking/key";
import { sendEmail } from "@/lib/email/send";
import { buildAdminNewRegistrationEmail } from "@/lib/email/templates/admin-new-registration";
import { getPlatformAdminEmails } from "@/lib/admin/platform-admin";
import { writePlatformAudit, PlatformAuditAction } from "@/lib/admin/audit";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Транслитерация + нормализация под slug (латиница, цифры, дефис).
 * Минимум для uniqueness внутри Organization.slug.
 */
function slugify(raw: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };
  const lower = raw.trim().toLowerCase();
  let out = "";
  for (const ch of lower) out += map[ch] ?? ch;
  out = out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return out || "org";
}

/** Подбираем уникальный slug: base, base-2, base-3 ... */
async function uniqueOrgSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 100; i += 1) {
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
  }
  // На всякий случай — хвост случайности
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function getPublicBaseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string; orgName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const { name, email, password, orgName } = body;

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "Заполни все поля" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Пароль не короче 8 символов" },
      { status: 400 },
    );
  }

  const emailNorm = email.trim().toLowerCase();

  const exists = await prisma.user.findUnique({
    where: { email: emailNorm },
  });
  if (exists) {
    return NextResponse.json({ error: "Email уже занят" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  const initials = initialsFromName(name.trim());

  // Название компании — из формы или по умолчанию "Компания <Имя>"
  const orgNameFinal = orgName?.trim() || `Компания ${name.trim()}`;
  const slug = await uniqueOrgSlug(slugify(orgNameFinal));

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: name.trim(),
        email: emailNorm,
        password: hashed,
        initials,
        // status: PENDING — берётся из дефолта схемы.
      },
    });

    const org = await tx.organization.create({
      data: {
        name: orgNameFinal,
        slug,
        plan: "free",
        trackingKey: generateTrackingKey(),
      },
    });

    await tx.orgMember.create({
      data: {
        orgId: org.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { currentOrgId: org.id },
    });

    return { user, org };
  });

  // Audit + email — best-effort, не блокирует ответ
  void writePlatformAudit({
    actorId: result.user.id,
    action: PlatformAuditAction.USER_REGISTERED,
    targetId: result.user.id,
    details: { orgId: result.org.id, orgSlug: result.org.slug },
  });

  const adminEmails = getPlatformAdminEmails();
  if (adminEmails.length > 0) {
    const baseUrl = getPublicBaseUrl(req);
    const reviewUrl = baseUrl
      ? `${baseUrl}/admin/users/${result.user.id}`
      : `/admin/users/${result.user.id}`;
    const tpl = buildAdminNewRegistrationEmail({
      userName: result.user.name,
      userEmail: result.user.email,
      orgName: result.org.name,
      reviewUrl,
      registeredAt: new Date(),
    });
    for (const adminEmail of adminEmails) {
      void sendEmail({
        to: adminEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    }
  }

  return NextResponse.json({
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
    org: { id: result.org.id, name: result.org.name, slug: result.org.slug },
    status: "PENDING",
  });
}
