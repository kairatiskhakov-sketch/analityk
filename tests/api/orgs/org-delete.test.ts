/**
 * PATCH/DELETE /api/orgs/:orgId — переименование и удаление организации.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { jsonReq, jsonBody } from "../../helpers/mocks";

const prisma = vi.hoisted(() => ({
  orgMember: { findUnique: vi.fn() },
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: { updateMany: vi.fn() },
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

import { PATCH, DELETE } from "@/app/api/orgs/[orgId]/route";

const ORG = "org_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function login(role: "OWNER" | "ADMIN" | "VIEWER", userId = "u_actor") {
  session.getSessionUser.mockResolvedValue({
    id: userId,
    email: "a@a",
    currentOrgId: ORG,
  });
  prisma.orgMember.findUnique.mockResolvedValueOnce({
    id: "m_actor",
    orgId: ORG,
    userId,
    role,
  });
}

describe("PATCH /api/orgs/:orgId", () => {
  it("403 для VIEWER", async () => {
    login("VIEWER");
    const res = await PATCH(jsonReq("PATCH", "http://x/", { name: "New" }), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(403);
  });

  it("400 без name", async () => {
    login("OWNER");
    const res = await PATCH(jsonReq("PATCH", "http://x/", {}), {
      params: { orgId: ORG },
    });
    expect(res.status).toBe(400);
  });

  it("ok: переименование пишет audit ORG_RENAMED", async () => {
    login("OWNER");
    prisma.organization.findUnique.mockResolvedValueOnce({ name: "Old" });
    prisma.organization.update.mockResolvedValueOnce({
      id: ORG,
      name: "New",
      slug: "o1",
      plan: "PRO",
    });
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { name: "New" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    expect(prisma.orgAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "org.renamed" }),
      }),
    );
  });

  it("без audit если имя не поменялось", async () => {
    login("OWNER");
    prisma.organization.findUnique.mockResolvedValueOnce({ name: "Same" });
    prisma.organization.update.mockResolvedValueOnce({
      id: ORG,
      name: "Same",
      slug: "o1",
      plan: "PRO",
    });
    const res = await PATCH(
      jsonReq("PATCH", "http://x/", { name: "Same" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    expect(prisma.orgAudit.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/orgs/:orgId", () => {
  it("403 для ADMIN", async () => {
    login("ADMIN");
    const res = await DELETE(
      jsonReq("DELETE", "http://x/", { confirmSlug: "o1" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(403);
  });

  it("400: confirmSlug не совпадает", async () => {
    login("OWNER");
    prisma.organization.findUnique.mockResolvedValueOnce({
      id: ORG,
      slug: "o1",
    });
    const res = await DELETE(
      jsonReq("DELETE", "http://x/", { confirmSlug: "wrong" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(400);
    expect((await jsonBody(res)).error).toContain("confirmSlug");
  });

  it("ok: удаляет в транзакции и нулит currentOrgId", async () => {
    login("OWNER");
    prisma.organization.findUnique.mockResolvedValueOnce({
      id: ORG,
      slug: "o1",
    });
    const res = await DELETE(
      jsonReq("DELETE", "http://x/", { confirmSlug: "o1" }),
      { params: { orgId: ORG } },
    );
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
