import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findMany: vi.fn(),
  },
  task: {
    findMany: vi.fn(),
  },
  project: {
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/search/route";

describe("search route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organizationMember.findMany.mockReset();
    prismaMock.task.findMany.mockReset();
    prismaMock.project.findMany.mockReset();
    prismaMock.user.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns empty results for short queries without hitting Prisma", async () => {
    const response = await GET(new Request("http://localhost/api/search?q=a"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tasks: [],
      projects: [],
      members: [],
    });
    expect(prismaMock.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it("searches tasks, projects, and members across the user's orgs", async () => {
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([
      { organizationId: "org-1" },
    ]);
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        title: "Improve search",
        status: "TODO",
        priority: "HIGH",
        board: { project: { id: "project-1", name: "Roadmap" } },
      },
    ]);
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Roadmap",
        organization: { name: "Platform Team" },
      },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: "user-2",
        name: "Shashank",
        email: "shashank@example.com",
        image: null,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/search?q=road"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tasks: [
        {
          id: "task-1",
          title: "Improve search",
          status: "TODO",
          priority: "HIGH",
          projectId: "project-1",
          projectName: "Roadmap",
        },
      ],
      projects: [
        {
          id: "project-1",
          name: "Roadmap",
          organization: { name: "Platform Team" },
        },
      ],
      members: [
        {
          id: "user-2",
          name: "Shashank",
          email: "shashank@example.com",
          image: null,
        },
      ],
    });
  });

  it("returns 500 for unexpected search failures", async () => {
    prismaMock.organizationMember.findMany.mockRejectedValueOnce(
      new Error("db down"),
    );

    const response = await GET(
      new Request("http://localhost/api/search?q=road"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
