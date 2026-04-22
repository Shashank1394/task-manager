import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { DELETE, PATCH } from "@/app/api/organizations/[orgId]/members/route";

describe("organization members route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.organizationMember.findFirst.mockReset();
    prismaMock.organizationMember.findUnique.mockReset();
    prismaMock.organizationMember.count.mockReset();
    prismaMock.organizationMember.update.mockReset();
    prismaMock.organizationMember.delete.mockReset();
  });

  it("prevents demoting the last admin", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      organizationId: "org-1",
      role: "ADMIN",
      userId: "user-1",
    });
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: "member-1",
      organizationId: "org-1",
      role: "ADMIN",
      userId: "user-1",
    });
    prismaMock.organizationMember.count.mockResolvedValueOnce(1);

    const request = new Request(
      "http://localhost/api/organizations/org-1/members",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1", role: "MEMBER" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Cannot remove the last admin",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it("prevents non-admins from removing other members", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      organizationId: "org-1",
      role: "MEMBER",
      userId: "user-1",
    });
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: "member-2",
      organizationId: "org-1",
      role: "MEMBER",
      userId: "user-2",
    });

    const request = new Request(
      "http://localhost/api/organizations/org-1/members",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-2" }),
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Only admins can remove other members",
      code: "FORBIDDEN",
    });
    expect(prismaMock.organizationMember.delete).not.toHaveBeenCalled();
  });

  it("allows members to remove themselves", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      organizationId: "org-1",
      role: "MEMBER",
      userId: "user-1",
    });
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: "member-1",
      organizationId: "org-1",
      role: "MEMBER",
      userId: "user-1",
    });
    prismaMock.organizationMember.delete.mockResolvedValueOnce({
      id: "member-1",
    });

    const request = new Request(
      "http://localhost/api/organizations/org-1/members",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1" }),
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ removed: true });
    expect(prismaMock.organizationMember.delete).toHaveBeenCalledWith({
      where: { id: "member-1" },
    });
  });
});
