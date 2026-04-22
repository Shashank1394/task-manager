import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
  },
  projectClient: {
    findUnique: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/tasks/[taskId]/github/route";

describe("task github route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.task.findFirst.mockReset();
    prismaMock.organizationMember.findFirst.mockReset();
    prismaMock.projectClient.findUnique.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 404 when the task is not visible to the user", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/tasks/task-1/github"),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Task not found",
      code: "NOT_FOUND",
    });
  });

  it("returns 403 for client members without project access", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({
      board: { project: { id: "project-1", organizationId: "org-1" } },
      githubIssueUrl: null,
      githubIssue: null,
      githubPRs: [],
      githubCommits: [],
    });
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      role: "CLIENT",
    });
    prismaMock.projectClient.findUnique.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/tasks/task-1/github"),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("returns GitHub issue, pull request, and commit metadata for authorized users", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({
      board: { project: { id: "project-1", organizationId: "org-1" } },
      githubIssueUrl: "https://github.com/octo/repo/issues/5",
      githubIssue: {
        githubIssueNumber: 5,
        syncDirection: "EXPORTED",
        lastSyncedAt: "2026-04-22T10:00:00.000Z",
      },
      githubPRs: [{ id: "pr-1", title: "PR" }],
      githubCommits: [{ id: "commit-1", message: "commit" }],
    });
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      role: "MEMBER",
    });

    const response = await GET(
      new Request("http://localhost/api/tasks/task-1/github"),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      issue: {
        number: 5,
        url: "https://github.com/octo/repo/issues/5",
        syncDirection: "EXPORTED",
        lastSyncedAt: "2026-04-22T10:00:00.000Z",
      },
      pullRequests: [{ id: "pr-1", title: "PR" }],
      commits: [{ id: "commit-1", message: "commit" }],
    });
  });

  it("returns 500 for unexpected task GitHub lookup failures", async () => {
    prismaMock.task.findFirst.mockRejectedValueOnce(new Error("db down"));

    const response = await GET(
      new Request("http://localhost/api/tasks/task-1/github"),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
