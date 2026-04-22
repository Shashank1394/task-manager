import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  sprint: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  task: {
    updateMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import {
  DELETE,
  GET,
  PATCH,
  POST,
} from "@/app/api/projects/[projectId]/sprints/route";

describe("project sprints route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.project.findUnique.mockReset();
    prismaMock.sprint.findMany.mockReset();
    prismaMock.sprint.create.mockReset();
    prismaMock.sprint.findFirst.mockReset();
    prismaMock.sprint.updateMany.mockReset();
    prismaMock.sprint.update.mockReset();
    prismaMock.sprint.delete.mockReset();
    prismaMock.task.updateMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 403 when sprint access is denied", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organization: { members: [{ userId: "user-1", role: "CLIENT" }] },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/sprints"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("returns 400 for invalid sprint date ranges", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organization: { members: [{ userId: "user-1", role: "ADMIN" }] },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sprint 1",
          startDate: "2026-04-22",
          endDate: "2026-04-20",
        }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid sprint payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.sprint.create).not.toHaveBeenCalled();
  });

  it("completes the current active sprint before activating another one", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organization: { members: [{ userId: "user-1", role: "MEMBER" }] },
    });
    prismaMock.sprint.findFirst.mockResolvedValueOnce({
      id: "sprint-2",
      status: "PLANNING",
    });
    prismaMock.sprint.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.sprint.update.mockResolvedValueOnce({
      id: "sprint-2",
      status: "ACTIVE",
      _count: { tasks: 3 },
    });

    const response = await PATCH(
      new Request("http://localhost/api/projects/project-1/sprints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: "sprint-2", status: "ACTIVE" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.sprint.updateMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
    expect(prismaMock.sprint.update).toHaveBeenCalledWith({
      where: { id: "sprint-2" },
      data: { status: "ACTIVE" },
      include: {
        _count: { select: { tasks: true } },
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "sprint-2",
      status: "ACTIVE",
      _count: { tasks: 3 },
    });
  });

  it("unlinks tasks before deleting a sprint", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organization: { members: [{ userId: "user-1", role: "ADMIN" }] },
    });
    prismaMock.sprint.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      projectId: "project-1",
    });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 2 });
    prismaMock.sprint.delete.mockResolvedValueOnce({ id: "sprint-1" });

    const response = await DELETE(
      new Request(
        "http://localhost/api/projects/project-1/sprints?sprintId=sprint-1",
        {
          method: "DELETE",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.updateMany).toHaveBeenCalledWith({
      where: { sprintId: "sprint-1" },
      data: { sprintId: null },
    });
    expect(prismaMock.sprint.delete).toHaveBeenCalledWith({
      where: { id: "sprint-1" },
    });
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });
});
