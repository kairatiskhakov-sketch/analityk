/**
 * /api/invites/:token/accept — принятие инвайта.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { jsonReq } from "../../helpers/mocks";

const prisma = vi.hoisted(() => {
  const txCreate = vi.fn();
  const txUpdate = vi.fn();
  const txUserUpdate = vi.fn();
  const txOrgFind = vi.fn();
  const tx = {
    orgMember: { create: txCreate },
    orgInvite: { update: txUpdate },
    user: { update: txUserUpdate },
    organization: { findUnique: txOrgFind },
  };
  return {
    orgInvite: { findUnique: vi.fn() },
    orgMember: { findUnique: vi.fn() },
    orgAudit: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
    __tx: tx,
  };
});

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

import { POST } from "@/app/api/invites/[token]/accept/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/invites/:token/accept", () => {
  it("401 без сессии", async () => {
    session.getSessionUser.mockResolvedValue(null);
    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(401);
  });

  it("404 если токен неизвестен", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u", email: "a@a" });
    prisma.orgInvite.findUnique.mockResolvedValueOnce(null);
    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(404);
  });

  it("409 если уже accepted", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u", email: "a@a" });
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i",
      orgId: "org_1",
      email: "a@a",
      role: "VIEWER",
      acceptedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400_000),
    });
    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(409);
  });

  it("410 если revoked", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u", email: "a@a" });
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i",
      orgId: "org_1",
      email: "a@a",
      role: "VIEWER",
      acceptedAt: null,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
    });
    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(410);
  });

  it("410 если expired", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u", email: "a@a" });
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i",
      orgId: "org_1",
      email: "a@a",
      role: "VIEWER",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(410);
  });

  it("403 если email сессии не совпадает", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u", email: "other@x" });
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i",
      orgId: "org_1",
      email: "invited@x",
      role: "VIEWER",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400_000),
    });
    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(403);
  });

  it("ok: принимает, транзакция выполняется, audit пишется", async () => {
    session.getSessionUser.mockResolvedValue({ id: "u1", email: "invited@x" });
    prisma.orgInvite.findUnique.mockResolvedValueOnce({
      id: "i",
      orgId: "org_1",
      email: "invited@x",
      role: "VIEWER",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400_000),
      invitedBy: "u_inviter",
    });
    prisma.orgMember.findUnique.mockResolvedValueOnce(null); // ещё не участник
    prisma.__tx.organization.findUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Org1",
      slug: "o1",
      plan: "PRO",
    });

    const res = await POST(jsonReq("POST", "http://x/"), {
      params: { token: "tok" },
    });
    expect(res.status).toBe(200);
    expect(prisma.__tx.orgMember.create).toHaveBeenCalledOnce();
    expect(prisma.__tx.orgInvite.update).toHaveBeenCalledOnce();
    expect(prisma.__tx.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { currentOrgId: "org_1" },
    });
    expect(prisma.orgAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "invite.accepted" }),
      }),
    );
  });
});
