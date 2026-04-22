import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
  },
  comment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const logActivityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/activity", () => ({ logActivity: logActivityMock }));

import { GET, POST } from "@/app/api/tasks/[taskId]/comments/route";

describe("task comments route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.task.findFirst.mockReset();
    prismaMock.comment.findMany.mockReset();
    prismaMock.comment.create.mockReset();
    logActivityMock.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 404 when the task is not visible for comment listing", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/tasks/task-1/comments"),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Task not found",
      code: "NOT_FOUND",
    });
  });

  it("returns 400 for invalid comment payloads before the write", async () => {
    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid comment payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.task.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });

  it("blocks comment creation for forbidden task access", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Ship it" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });

  it("creates comments and logs task activity", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({
      title: "Roadmap sync",
      board: { projectId: "project-1" },
    });
    prismaMock.comment.create.mockResolvedValueOnce({
      id: "comment-1",
      content: "Ship it",
      user: { id: "user-1", name: "Shashank", image: null },
    });

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Ship it" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(201);
    expect(prismaMock.comment.create).toHaveBeenCalledWith({
      data: {
        content: "Ship it",
        taskId: "task-1",
        userId: "user-1",
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });
    expect(logActivityMock).toHaveBeenCalledWith({
      type: "COMMENT_ADDED",
      message: 'commented on "Roadmap sync"',
      userId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
    });
    await expect(response.json()).resolves.toEqual({
      id: "comment-1",
      content: "Ship it",
      user: { id: "user-1", name: "Shashank", image: null },
    });
  });
});
