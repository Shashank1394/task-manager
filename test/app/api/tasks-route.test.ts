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
    requireAuthMock.mockReset();
    logActivityMock.mockReset();
    notifyMock.mockReset();
    prismaMock.task.findFirst.mockReset();
    prismaMock.task.update.mockReset();
    prismaMock.organizationMember.findFirst.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      title: "Existing task",
      status: "TODO",
      assigneeId: null,
      board: { project: { organizationId: "org-1" } },
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

  it("returns 400 when attempting to assign a task to a client member", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: "user-client" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ taskId: "task-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Tasks can only be assigned to team members",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: "user-client",
        role: { not: "CLIENT" },
      },
      select: { id: true },
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("allows assigning a task to a non-client organization member", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      id: "member-2",
    });
    prismaMock.task.update.mockResolvedValueOnce({
      id: "task-1",
      title: "Existing task",
      status: "TODO",
      assigneeId: "user-2",
      assignee: {
        id: "user-2",
        name: "Alex",
        email: "alex@example.com",
        image: null,
      },
      board: { projectId: "project-1" },
    });

    const request = new Request("http://localhost/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: "user-2" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ taskId: "task-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      assigneeId: "user-2",
      assignee: { id: "user-2", name: "Alex" },
    });
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { assigneeId: "user-2" },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        board: {
          select: { projectId: true },
        },
      },
    });
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TASK_ASSIGNED",
        projectId: "project-1",
        taskId: "task-1",
      }),
    );
    expect(notifyMock).toHaveBeenCalledWith(
      "user-2",
      "TASK_ASSIGNED",
      'You were assigned to "Existing task"',
      "/dashboard/project/project-1",
    );
  });
});
