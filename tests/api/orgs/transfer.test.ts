/**
 * /api/orgs/:orgId/transfer — передача владения.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { jsonReq, jsonBody } from "../../helpers/mocks";

const prisma = vi.hoisted(() => ({
  orgMember: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  orgAudit: { create: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: session.getSessionUser,
}));
vi.mock("@/lib/log/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  errorFields: () => ({}),
}));

import { POST } from "@/app/api/orgs/[orgId]/transfer/route";

const ORG = "org_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function loginOwner(userId = "u_actor") {
  session.getSessionUser.mockResolvedValue({
    id: userId,
    email: "a@a",
    currentOrgId: ORG,
  });
  prisma.orgMember.findUnique.mockResolvedValueOnce({
    id: "m_actor",
    orgId: ORG,
    userId,
    role: "OWNER",
  });
}

describe("POST /api/orgs/:orgId/transfer", () => {
  it("401 без сессии", async () => {
    session.getSessionUser.mockResolvedValue(null);
    const res = await POST(jsonReq("POST", "http://x/", { userId: "u2" }), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(401);
  });

  it("403 если actor не OWNER", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u", email: "a@a" });
    prisma.orgMember.findUnique.mockResolvedValueOnce({
      id: "m",
      orgId: ORG,
      userId: "u",
      role: "ADMIN",
    });
    const res = await POST(jsonReq("POST", "http://x/", { userId: "u2" }), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(403);
  });

  it("400: self-transfer запрещён", async () => {
    loginOwner("u_actor");
    const res = await POST(
      jsonReq("POST", "http://x/", { userId: "u_actor" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(400);
  });

  it("404: target не состоит в org", async () => {
    loginOwner();
    prisma.orgMember.findUnique.mockResolvedValueOnce(null);
    const res = await POST(jsonReq("POST", "http://x/", { userId: "ghost" }), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(404);
  });

  it("noop: target уже OWNER, demoteSelf=false → возвращает note", async () => {
    loginOwner();
    prisma.orgMember.findUnique.mockResolvedValueOnce({
      id: "m_t",
      orgId: ORG,
      userId: "u_t",
      role: "OWNER",
    });
    const res = await POST(
      jsonReq("POST", "http://x/", { userId: "u_t" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.note).toContain("уже владелец");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ok: добавляет OWNER'а без понижения себя", async () => {
    loginOwner();
    prisma.orgMember.findUnique.mockResolvedValueOnce({
      id: "m_t",
      orgId: ORG,
      userId: "u_t",
      role: "ADMIN",
    });
    prisma.orgMember.update.mockResolvedValue({});
    const res = await POST(jsonReq("POST", "http://x/", { userId: "u_t" }), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.self.role).toBe("OWNER");
    expect(body.target.role).toBe("OWNER");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.orgAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ownership.transferred" }),
      }),
    );
  });

  it("ok: demoteSelf=true переводит actor в ADMIN", async () => {
    loginOwner();
    prisma.orgMember.findUnique.mockResolvedValueOnce({
      id: "m_t",
      orgId: ORG,
      userId: "u_t",
      role: "ADMIN",
    });
    prisma.orgMember.update.mockResolvedValue({});
    const res = await POST(
      jsonReq("POST", "http://x/", { userId: "u_t", demoteSelf: true }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.self.role).toBe("ADMIN");
  });
});
