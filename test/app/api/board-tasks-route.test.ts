import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  board: {
    findFirst: vi.fn(),
  },
  task: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const logActivityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/activity", () => ({ logActivity: logActivityMock }));

import { GET, POST } from "@/app/api/boards/[boardId]/tasks/route";

describe("board tasks route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.board.findFirst.mockReset();
    prismaMock.task.create.mockReset();
    prismaMock.task.findUnique.mockReset();
    prismaMock.task.findMany.mockReset();
    logActivityMock.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 400 for invalid create payloads before querying the board", async () => {
    const request = new Request("http://localhost/api/boards/board-1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "ab" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ boardId: "board-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid task payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.board.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the user cannot create tasks on the board", async () => {
    prismaMock.board.findFirst.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/boards/board-1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid task title" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ boardId: "board-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("creates tasks with default status and priority", async () => {
    prismaMock.board.findFirst.mockResolvedValueOnce({
      id: "board-1",
      projectId: "project-1",
    });
    prismaMock.task.create.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      title: "Valid task title",
      description: null,
      priority: "MEDIUM",
      status: "TODO",
      assignee: null,
      labels: [],
      sprint: null,
      _count: { comments: 0 },
    });

    const request = new Request("http://localhost/api/boards/board-1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid task title" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ boardId: "board-1" }),
    });

    expect(response.status).toBe(201);
    expect(prismaMock.task.create).toHaveBeenCalledWith({
      data: {
        title: "Valid task title",
        description: null,
        priority: "MEDIUM",
        status: "TODO",
        boardId: "board-1",
      },
    });
    expect(logActivityMock).toHaveBeenCalledWith({
      type: "TASK_CREATED",
      message: 'created "Valid task title"',
      userId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
    });
    await expect(response.json()).resolves.toEqual({
      id: "task-1",
      title: "Valid task title",
      description: null,
      priority: "MEDIUM",
      status: "TODO",
      assignee: null,
      labels: [],
      sprint: null,
      _count: { comments: 0 },
    });
  });

  it("lists tasks for users with board access", async () => {
    prismaMock.board.findFirst.mockResolvedValueOnce({ id: "board-1" });
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        title: "Existing task",
        priority: "LOW",
        status: "TODO",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/boards/board-1/tasks"),
      {
        params: Promise.resolve({ boardId: "board-1" }),
      },
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
        sprint: { select: { id: true, name: true, status: true } },
        _count: { select: { comments: true } },
      },
    });
    await expect(response.json()).resolves.toEqual([
      {
        id: "task-1",
        title: "Existing task",
        priority: "LOW",
        status: "TODO",
      },
    ]);
  });
});
