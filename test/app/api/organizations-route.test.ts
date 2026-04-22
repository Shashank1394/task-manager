import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organization: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET, POST } from "@/app/api/organizations/route";

describe("organizations route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organization.create.mockReset();
    prismaMock.organization.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 400 for invalid organization payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ab" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid organization payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
  });

  it("creates an organization with the requester as admin", async () => {
    prismaMock.organization.create.mockResolvedValueOnce({
      id: "org-1",
      name: "Platform Team",
    });

    const response = await POST(
      new Request("http://localhost/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Platform Team" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(prismaMock.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Platform Team",
        members: {
          create: {
            userId: "user-1",
            role: "ADMIN",
          },
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "org-1",
      name: "Platform Team",
    });
  });

  it("lists organizations scoped to the current user", async () => {
    const createdAt = new Date("2026-04-22T12:00:00.000Z");
    prismaMock.organization.findMany.mockResolvedValueOnce([
      {
        id: "org-1",
        name: "Platform Team",
        createdAt,
        members: [{ role: "ADMIN" }],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
      where: {
        members: {
          some: {
            userId: "user-1",
          },
        },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          where: {
            userId: "user-1",
          },
          select: {
            role: true,
          },
        },
      },
    });
    await expect(response.json()).resolves.toEqual([
      {
        id: "org-1",
        name: "Platform Team",
        createdAt: "2026-04-22T12:00:00.000Z",
        members: [{ role: "ADMIN" }],
      },
    ]);
  });
});
