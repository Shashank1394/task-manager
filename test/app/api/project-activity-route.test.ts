import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  activity: {
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/projects/[projectId]/activity/route";

describe("project activity route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.project.findFirst.mockReset();
    prismaMock.activity.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 404 when the project is not visible to the user", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/activity"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("lists recent activity and clamps the limit to 100", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: "project-1" });
    prismaMock.activity.findMany.mockResolvedValueOnce([
      { id: "activity-1", message: "created task" },
    ]);

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/activity?limit=500"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.activity.findMany).toHaveBeenCalledWith({
      where: { projectId: "project-1" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, image: true } },
        task: { select: { id: true, title: true } },
      },
    });
    await expect(response.json()).resolves.toEqual([
      { id: "activity-1", message: "created task" },
    ]);
  });

  it("returns 500 for unexpected activity query failures", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: "project-1" });
    prismaMock.activity.findMany.mockRejectedValueOnce(new Error("db down"));

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/activity"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
