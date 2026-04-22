import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findFirst: vi.fn(),
  },
  organization: {
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { DELETE, PATCH } from "@/app/api/organizations/[orgId]/route";

describe("organization admin route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organizationMember.findFirst.mockReset();
    prismaMock.organization.update.mockReset();
    prismaMock.organization.delete.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 400 for invalid organization updates before membership lookup", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/organizations/org-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ab" }),
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid organization update payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it("requires admin access to rename an organization", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      role: "MEMBER",
    });

    const response = await PATCH(
      new Request("http://localhost/api/organizations/org-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Platform Team" }),
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Admin access required",
      code: "FORBIDDEN",
    });
  });

  it("renames the organization for admins", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      role: "ADMIN",
    });
    prismaMock.organization.update.mockResolvedValueOnce({
      id: "org-1",
      name: "Platform Team",
    });

    const response = await PATCH(
      new Request("http://localhost/api/organizations/org-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Platform Team" }),
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { name: "Platform Team" },
    });
    await expect(response.json()).resolves.toEqual({
      id: "org-1",
      name: "Platform Team",
    });
  });

  it("deletes the organization for admins", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      role: "ADMIN",
    });
    prismaMock.organization.delete.mockResolvedValueOnce({ id: "org-1" });

    const response = await DELETE(
      new Request("http://localhost/api/organizations/org-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.organization.delete).toHaveBeenCalledWith({
      where: { id: "org-1" },
    });
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });
});
