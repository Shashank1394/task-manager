import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findFirst: vi.fn(),
  },
  project: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET, POST } from "@/app/api/organizations/[orgId]/projects/route";

describe("organization projects route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organizationMember.findFirst.mockReset();
    prismaMock.project.create.mockReset();
    prismaMock.project.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 400 for invalid project payloads before membership lookup", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/org-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ab" }),
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid project payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it("blocks client members from listing organization projects", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      role: "CLIENT",
    });

    const response = await GET(
      new Request("http://localhost/api/organizations/org-1/projects"),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
  });

  it("creates a project with a board for non-client members", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      role: "ADMIN",
    });
    prismaMock.project.create.mockResolvedValueOnce({
      id: "project-1",
      name: "Roadmap",
      description: null,
      board: { id: "board-1" },
    });

    const response = await POST(
      new Request("http://localhost/api/organizations/org-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Roadmap", description: "" }),
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(201);
    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: {
        name: "Roadmap",
        description: null,
        organizationId: "org-1",
        board: { create: {} },
      },
      include: { board: true },
    });
    await expect(response.json()).resolves.toEqual({
      id: "project-1",
      name: "Roadmap",
      description: null,
      board: { id: "board-1" },
    });
  });

  it("lists projects for non-client members", async () => {
    const createdAt = new Date("2026-04-22T13:00:00.000Z");
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-1",
      role: "MEMBER",
    });
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Roadmap",
        description: "Q2 scope",
        createdAt,
        board: { id: "board-1" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-1/projects"),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        board: { select: { id: true } },
      },
    });
    await expect(response.json()).resolves.toEqual([
      {
        id: "project-1",
        name: "Roadmap",
        description: "Q2 scope",
        createdAt: "2026-04-22T13:00:00.000Z",
        board: { id: "board-1" },
      },
    ]);
  });
});
