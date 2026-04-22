import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
  },
  projectClient: {
    findUnique: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
  },
  gitHubIssue: {
    findUnique: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const logActivityMock = vi.hoisted(() => vi.fn());
const notifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/activity", () => ({
  logActivity: logActivityMock,
  notify: notifyMock,
}));

import { PATCH } from "@/app/api/tasks/[taskId]/route";

describe("PATCH /api/tasks/[taskId]", () => {
  beforeEach(() => {
    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      title: "Existing task",
      status: "TODO",
      assigneeId: null,
    });
  });

  it("returns 400 for invalid update payloads", async () => {
    const request = new Request("http://localhost/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "ab" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ taskId: "task-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "BAD_REQUEST",
      error: "Invalid task update payload",
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("returns 401 when auth fails with UNAUTHORIZED", async () => {
    requireAuthMock.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid task title" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ taskId: "task-1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });
});
