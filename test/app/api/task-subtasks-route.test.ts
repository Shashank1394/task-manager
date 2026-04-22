import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
  },
  subtask: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { DELETE, PATCH, POST } from "@/app/api/tasks/[taskId]/subtasks/route";

describe("task subtasks route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.task.findFirst.mockReset();
    prismaMock.subtask.create.mockReset();
    prismaMock.subtask.findFirst.mockReset();
    prismaMock.subtask.update.mockReset();
    prismaMock.subtask.deleteMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 403 when subtask access is denied", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Draft notes" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("returns 400 for invalid subtask update payloads", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });

    const response = await PATCH(
      new Request("http://localhost/api/tasks/task-1/subtasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskId: "subtask-1" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid subtask update payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.subtask.findFirst).not.toHaveBeenCalled();
  });

  it("updates only the requested subtask fields inside the task scope", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.subtask.findFirst.mockResolvedValueOnce({ id: "subtask-1" });
    prismaMock.subtask.update.mockResolvedValueOnce({
      id: "subtask-1",
      title: "Refine copy",
      done: true,
    });

    const response = await PATCH(
      new Request("http://localhost/api/tasks/task-1/subtasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtaskId: "subtask-1",
          title: "Refine copy",
          done: true,
        }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.subtask.findFirst).toHaveBeenCalledWith({
      where: { id: "subtask-1", taskId: "task-1" },
      select: { id: true },
    });
    expect(prismaMock.subtask.update).toHaveBeenCalledWith({
      where: { id: "subtask-1" },
      data: {
        done: true,
        title: "Refine copy",
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "subtask-1",
      title: "Refine copy",
      done: true,
    });
  });

  it("returns 404 when deleting a subtask outside the task scope", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.subtask.deleteMany.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(
      new Request("http://localhost/api/tasks/task-1/subtasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskId: "subtask-1" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Subtask not found",
      code: "NOT_FOUND",
    });
  });
});
