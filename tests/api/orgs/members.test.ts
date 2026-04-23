/**
 * Интеграционные тесты для /api/orgs/:orgId/members/:userId (PATCH, DELETE).
 * Мокаем Prisma + сессию; проверяем authz, last-owner guard, self-leave и т.п.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { jsonReq, jsonBody } from "../../helpers/mocks";

// --- моки ДО импорта роута ---
const prisma = vi.hoisted(() => ({
  orgMember: {
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
  },
  orgAudit: { create: vi.fn().mockResolvedValue({}) },
  user: { update: vi.fn() },
}));

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: session.getSessionUser,
}));

// Заглушаем логгер, чтобы не шуметь.
vi.mock("@/lib/log/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  errorFields: () => ({}),
}));

// --- импорт теперь безопасен ---
import {
  PATCH,
  DELETE,
} from "@/app/api/orgs/[orgId]/members/[userId]/route";

const ORG = "org_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function setActor(role: "OWNER" | "ADMIN" | "VIEWER", userId = "u_actor") {
  session.getSessionUser.mockResolvedValue({
    id: userId,
    email: "a@a",
    currentOrgId: ORG,
  });
  prisma.orgMember.findUnique.mockImplementationOnce(async ({ where }: any) => {
    if (where.orgId_userId?.userId === userId) {
      return { id: "m_actor", orgId: ORG, userId, role };
    }
    return null;
  });
}

function setTarget(role: "OWNER" | "ADMIN" | "VIEWER", userId = "u_target") {
  prisma.orgMember.findUnique.mockImplementationOnce(async () => ({
    id: "m_target",
    orgId: ORG,
    userId,
    role,
  }));
}

describe("PATCH /api/orgs/:orgId/members/:userId", () => {
  it("401 без сессии", async () => {
    session.getSessionUser.mockResolvedValue(null);
    const res = await PATCH(
      jsonReq("PATCH", "http://x/api/orgs/org_1/members/u_target", {
        role: "ADMIN",
      }),
      { params: { orgId: ORG, userId: "u_target" } },
    );
    expect(res.status).toBe(401);
  });

  it("403 если actor — VIEWER", async () => {
    setActor("VIEWER");
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { role: "ADMIN" }),
      { params: { orgId: ORG, userId: "u_target" } },
    );
    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.error).toContain("Недостаточно");
  });

  it("400 при некорректной роли", async () => {
    setActor("OWNER");
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { role: "SUPERHERO" as any }),
      { params: { orgId: ORG, userId: "u_target" } },
    );
    expect(res.status).toBe(400);
  });

  it("403: ADMIN пытается трогать OWNER'а", async () => {
    setActor("ADMIN");
    setTarget("OWNER");
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { role: "ADMIN" }),
      { params: { orgId: ORG, userId: "u_target" } },
    );
    expect(res.status).toBe(403);
  });

  it("400: нельзя понизить последнего OWNER", async () => {
    setActor("OWNER");
    setTarget("OWNER");
    prisma.orgMember.count.mockResolvedValueOnce(1);
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { role: "ADMIN" }),
      { params: { orgId: ORG, userId: "u_target" } },
    );
    expect(res.status).toBe(400);
    expect((await jsonBody(res)).error).toContain("последнего");
  });

  it("ok: OWNER понижает другого OWNER при наличии второго", async () => {
    setActor("OWNER");
    setTarget("OWNER");
    prisma.orgMember.count.mockResolvedValueOnce(2);
    prisma.orgMember.update.mockResolvedValueOnce({
      id: "m_target",
      userId: "u_target",
      role: "ADMIN",
    });
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { role: "ADMIN" }),
      { params: { orgId: ORG, userId: "u_target" } },
    );
    expect(res.status).toBe(200);
    expect((await jsonBody(res)).member.role).toBe("ADMIN");
    expect(prisma.orgAudit.create).toHaveBeenCalledOnce();
  });
});

describe("DELETE /api/orgs/:orgId/members/:userId", () => {
  it("404 если target не найден", async () => {
    setActor("OWNER");
    prisma.orgMember.findUnique.mockImplementationOnce(async () => null);
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, userId: "ghost" },
    });
    expect(res.status).toBe(404);
  });

  it("400: нельзя удалить последнего OWNER", async () => {
    setActor("OWNER");
    setTarget("OWNER");
    prisma.orgMember.count.mockResolvedValueOnce(1);
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, userId: "u_target" },
    });
    expect(res.status).toBe(400);
  });

  it("ok: ADMIN удаляет VIEWER", async () => {
    setActor("ADMIN");
    setTarget("VIEWER");
    prisma.orgMember.delete.mockResolvedValueOnce({});
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, userId: "u_target" },
    });
    expect(res.status).toBe(200);
    expect(prisma.orgMember.delete).toHaveBeenCalledOnce();
    expect(prisma.orgAudit.create).toHaveBeenCalledOnce();
  });

  it("403: ADMIN пытается удалить OWNER'а (не сам себя)", async () => {
    setActor("ADMIN");
    setTarget("OWNER");
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, userId: "u_target" },
    });
    expect(res.status).toBe(403);
  });

  it("ok: self-leave, переключение currentOrgId", async () => {
    // self: actor.userId === target.userId
    session.getSessionUser.mockResolvedValue({
      id: "u_self",
      email: "s@s",
      currentOrgId: ORG,
    });
    prisma.orgMember.findUnique
      .mockImplementationOnce(async () => ({
        id: "m_actor",
        orgId: ORG,
        userId: "u_self",
        role: "VIEWER",
      }))
      .mockImplementationOnce(async () => ({
        id: "m_target",
        orgId: ORG,
        userId: "u_self",
        role: "VIEWER",
      }));
    prisma.orgMember.delete.mockResolvedValueOnce({});
    prisma.orgMember.findFirst.mockResolvedValueOnce({ orgId: "org_other" });
    prisma.user.update.mockResolvedValueOnce({});
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, userId: "u_self" },
    });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u_self" },
      data: { currentOrgId: "org_other" },
    });
  });
});
