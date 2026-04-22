import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
  },
  label: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { DELETE, GET, POST } from "@/app/api/tasks/[taskId]/labels/route";

describe("task labels route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.task.findFirst.mockReset();
    prismaMock.label.findMany.mockReset();
    prismaMock.label.create.mockReset();
    prismaMock.label.deleteMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 403 when task label access is denied", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/tasks/task-1/labels"),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("returns 400 for invalid label payloads", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", color: "blue" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid label payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.label.create).not.toHaveBeenCalled();
  });

  it("creates labels with the default fallback color", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.label.create.mockResolvedValueOnce({
      id: "label-1",
      name: "Backend",
      color: "#6366f1",
      taskId: "task-1",
    });

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Backend" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(201);
    expect(prismaMock.label.create).toHaveBeenCalledWith({
      data: {
        name: "Backend",
        color: "#6366f1",
        taskId: "task-1",
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "label-1",
      name: "Backend",
      color: "#6366f1",
      taskId: "task-1",
    });
  });

  it("returns 404 when deleting a label outside the task scope", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.label.deleteMany.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(
      new Request("http://localhost/api/tasks/task-1/labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId: "label-1" }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Label not found",
      code: "NOT_FOUND",
    });
  });
});
