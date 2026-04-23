/**
 * Интеграционные тесты для /api/orgs/:orgId/invites (GET, POST) и
 * /api/orgs/:orgId/invites/:inviteId (DELETE).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { jsonReq, jsonBody } from "../../helpers/mocks";

const prisma = vi.hoisted(() => ({
  orgMember: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  orgInvite: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  organization: { findUnique: vi.fn() },
  orgAudit: { create: vi.fn().mockResolvedValue({}) },
}));

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: session.getSessionUser,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@/lib/log/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  errorFields: () => ({}),
}));

import {
  GET,
  POST,
} from "@/app/api/orgs/[orgId]/invites/route";
import { DELETE } from "@/app/api/orgs/[orgId]/invites/[inviteId]/route";

const ORG = "org_1";

function loginAs(role: "OWNER" | "ADMIN" | "VIEWER", userId = "u_actor") {
  session.getSessionUser.mockResolvedValue({
    id: userId,
    email: `${userId}@x`,
    name: "Actor",
    currentOrgId: ORG,
  });
  prisma.orgMember.findUnique.mockResolvedValueOnce({
    id: "m_actor",
    userId,
    orgId: ORG,
    role,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ ok: true });
});

describe("GET /api/orgs/:orgId/invites", () => {
  it("403 для VIEWER", async () => {
    loginAs("VIEWER");
    const res = await GET(jsonReq("GET", "http://x/"), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(403);
  });

  it("ok: возвращает только активные", async () => {
    loginAs("ADMIN");
    prisma.orgInvite.findMany.mockResolvedValueOnce([
      {
        id: "i1",
        email: "a@a",
        role: "VIEWER",
        token: "tok1",
        createdAt: new Date("2026-01-01"),
        expiresAt: new Date("2026-12-01"),
      },
    ]);
    const res = await GET(jsonReq("GET", "http://app.x/api/orgs/org_1/invites"), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.invites).toHaveLength(1);
    expect(body.invites[0].url).toContain("tok1");
  });
});

describe("POST /api/orgs/:orgId/invites", () => {
  it("403 для VIEWER", async () => {
    loginAs("VIEWER");
    const res = await POST(
      jsonReq("POST", "http://x/", { email: "u@u.test" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(403);
  });

  it("400 без email", async () => {
    loginAs("OWNER");
    const res = await POST(jsonReq("POST", "http://x/", {}), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(400);
  });

  it("403: ADMIN не может приглашать OWNER'а", async () => {
    loginAs("ADMIN");
    const res = await POST(
      jsonReq("POST", "http://x/", { email: "new@new.test", role: "OWNER" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(403);
  });

  it("409 если email уже участник", async () => {
    loginAs("OWNER");
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u_existing" });
    prisma.orgMember.findUnique.mockResolvedValueOnce({ id: "m_ex" });
    const res = await POST(
      jsonReq("POST", "http://x/", { email: "dup@dup.test" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(409);
  });

  it("ok: создаёт новый invite, пишет audit, шлёт письмо", async () => {
    loginAs("OWNER");
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.orgInvite.findFirst.mockResolvedValueOnce(null);
    prisma.orgInvite.create.mockResolvedValueOnce({
      id: "i_new",
      email: "new@x.test",
      role: "VIEWER",
      token: "tok_new",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
    });
    prisma.organization.findUnique.mockResolvedValueOnce({ name: "Org1" });

    const res = await POST(
      jsonReq("POST", "http://app/api/orgs/org_1/invites", {
        email: "new@x.test",
        role: "VIEWER",
      }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.invite.email).toBe("new@x.test");
    expect(body.emailSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(prisma.orgAudit.create).toHaveBeenCalledOnce();
    expect(prisma.orgAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "invite.created" }),
      }),
    );
  });

  it("переиспользует активный invite и меняет роль → audit INVITE_ROLE_CHANGED", async () => {
    loginAs("OWNER");
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.orgInvite.findFirst.mockResolvedValueOnce({
      id: "i_existing",
      email: "x@x.test",
      role: "VIEWER",
      token: "tok_old",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
    });
    prisma.orgInvite.update.mockResolvedValueOnce({
      id: "i_existing",
      email: "x@x.test",
      role: "ADMIN",
      token: "tok_old",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
    });
    prisma.organization.findUnique.mockResolvedValueOnce({ name: "Org1" });

    const res = await POST(
      jsonReq("POST", "http://app/", { email: "x@x.test", role: "ADMIN" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    expect(prisma.orgAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "invite.role_changed" }),
      }),
    );
  });
});

describe("DELETE /api/orgs/:orgId/invites/:inviteId", () => {
  it("404 если invite не найден", async () => {
    loginAs("OWNER");
    prisma.orgInvite.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, inviteId: "ghost" },
    });
    expect(res.status).toBe(404);
  });

  it("409 если уже принят", async () => {
    loginAs("OWNER");
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i1",
      orgId: ORG,
      email: "a@a",
      role: "VIEWER",
      acceptedAt: new Date(),
      revokedAt: null,
    });
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, inviteId: "i1" },
    });
    expect(res.status).toBe(409);
  });

  it("ok: отзывает активный и пишет audit", async () => {
    loginAs("OWNER");
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i1",
      orgId: ORG,
      email: "a@a",
      role: "VIEWER",
      acceptedAt: null,
      revokedAt: null,
    });
    prisma.orgInvite.update.mockResolvedValueOnce({});
    const res = await DELETE(new Request("http://x/", { method: "DELETE" }), {
      params: { orgId: ORG, inviteId: "i1" },
    });
    expect(res.status).toBe(200);
    expect(prisma.orgInvite.update).toHaveBeenCalledOnce();
    expect(prisma.orgAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "invite.revoked" }),
      }),
    );
  });
});
