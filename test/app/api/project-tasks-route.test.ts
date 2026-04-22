import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  task: {
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const checkClientProjectAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({
  requireAuth: requireAuthMock,
  checkClientProjectAccess: checkClientProjectAccessMock,
}));

import { GET } from "@/app/api/projects/[projectId]/tasks/route";

describe("project tasks route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    checkClientProjectAccessMock.mockReset();
    prismaMock.project.findUnique.mockReset();
    prismaMock.task.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 404 when the project does not exist", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/tasks"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Project not found",
    });
  });

  it("returns 403 when client project access is denied", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      board: { id: "board-1" },
      organization: { members: [] },
    });
    checkClientProjectAccessMock.mockResolvedValueOnce({
      allowed: false,
      role: "CLIENT",
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/tasks"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty array when the project has no board", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      board: null,
      organization: { members: [] },
    });
    checkClientProjectAccessMock.mockResolvedValueOnce({
      allowed: true,
      role: "MEMBER",
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/tasks"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it("lists project tasks when access is allowed", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      board: { id: "board-1" },
      organization: { members: [] },
    });
    checkClientProjectAccessMock.mockResolvedValueOnce({
      allowed: true,
      role: "MEMBER",
    });
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-1", title: "Existing task", status: "TODO" },
    ]);

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/tasks"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.findMany).toHaveBeenCalledWith({
      where: { boardId: "board-1" },
      orderBy: { createdAt: "asc" },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        labels: {
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
        sprint: {
          select: { id: true, name: true, status: true },
        },
        _count: { select: { comments: true } },
      },
    });
    await expect(response.json()).resolves.toEqual([
      { id: "task-1", title: "Existing task", status: "TODO" },
    ]);
  });

  it("returns 500 for unexpected task query failures instead of collapsing to 401", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      board: { id: "board-1" },
      organization: { members: [] },
    });
    checkClientProjectAccessMock.mockResolvedValueOnce({
      allowed: true,
      role: "MEMBER",
    });
    prismaMock.task.findMany.mockRejectedValueOnce(new Error("db down"));

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/tasks"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
