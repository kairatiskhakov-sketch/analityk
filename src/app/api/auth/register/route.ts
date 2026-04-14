import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const { name, email, password } = body;

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

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: emailNorm,
      password: hashed,
      initials,
    },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
  });
}
