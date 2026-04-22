import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findFirst: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
  projectClient: {
    findMany: vi.fn(),
  },
  project: {
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/client/[orgId]/dashboard/route";

describe("client dashboard route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organizationMember.findFirst.mockReset();
    prismaMock.organization.findUnique.mockReset();
    prismaMock.projectClient.findMany.mockReset();
    prismaMock.project.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 403 when the user is not in the organization", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/client/org-1/dashboard"),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("limits client users to their explicitly assigned projects", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      role: "CLIENT",
    });
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: "org-1",
      name: "Platform Team",
    });
    prismaMock.projectClient.findMany.mockResolvedValueOnce([
      { projectId: "project-1" },
    ]);
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Roadmap",
        board: {
          tasks: [
            { status: "TODO", priority: "HIGH" },
            { status: "DONE", priority: "LOW" },
          ],
        },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/client/org-1/dashboard"),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", id: { in: ["project-1"] } },
      include: {
        board: {
          include: {
            tasks: {
              select: { status: true, priority: true },
            },
          },
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      organization: { id: "org-1", name: "Platform Team" },
      overview: {
        totalTasks: 2,
        totalDone: 1,
        totalInProgress: 0,
        totalTodo: 1,
        overallCompletion: 50,
        projectCount: 1,
      },
      projects: [
        {
          id: "project-1",
          name: "Roadmap",
          total: 2,
          todo: 1,
          inProgress: 0,
          done: 1,
          completionPct: 50,
        },
      ],
    });
  });

  it("returns 500 for unexpected dashboard query failures", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      role: "MEMBER",
    });
    prismaMock.organization.findUnique.mockRejectedValueOnce(
      new Error("db down"),
    );

    const response = await GET(
      new Request("http://localhost/api/client/org-1/dashboard"),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
