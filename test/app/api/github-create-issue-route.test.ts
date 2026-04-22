import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden } from "@/lib/api-errors";

const transactionCalls = vi.hoisted(() => ({
  gitHubIssueCreate: vi.fn(),
  taskUpdate: vi.fn(),
  gitHubSyncLogCreate: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  gitHubIssue: {
    findUnique: vi.fn(),
    create: vi.fn((args) => {
      transactionCalls.gitHubIssueCreate(args);
      return { __op: "gitHubIssue.create", args };
    }),
  },
  task: {
    update: vi.fn((args) => {
      transactionCalls.taskUpdate(args);
      return { __op: "task.update", args };
    }),
  },
  gitHubSyncLog: {
    create: vi.fn((args) => {
      transactionCalls.gitHubSyncLogCreate(args);
      return { __op: "gitHubSyncLog.create", args };
    }),
  },
  $transaction: vi.fn(),
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireGitHubTaskAccessMock = vi.hoisted(() => vi.fn());
const requireGitHubAccessTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/github-route", () => ({
  requireGitHubTaskAccess: requireGitHubTaskAccessMock,
  requireGitHubAccessToken: requireGitHubAccessTokenMock,
}));

import { POST } from "@/app/api/tasks/[taskId]/github/create-issue/route";

describe("github create issue route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubTaskAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.gitHubIssue.findUnique.mockReset();
    prismaMock.gitHubIssue.create.mockClear();
    prismaMock.task.update.mockClear();
    prismaMock.gitHubSyncLog.create.mockClear();
    prismaMock.$transaction.mockReset();
    transactionCalls.gitHubIssueCreate.mockReset();
    transactionCalls.taskUpdate.mockReset();
    transactionCalls.gitHubSyncLogCreate.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    requireGitHubAccessTokenMock.mockResolvedValue("gh-token");
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("returns shared helper access errors before checking GitHub issue linkage", async () => {
    requireGitHubTaskAccessMock.mockRejectedValueOnce(forbidden("Forbidden"));

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/github/create-issue", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
    expect(prismaMock.gitHubIssue.findUnique).not.toHaveBeenCalled();
  });

  it("returns 409 when the task already has a linked GitHub issue", async () => {
    requireGitHubTaskAccessMock.mockResolvedValueOnce({
      id: "task-1",
      githubIssueUrl: "https://github.com/octo/repo/issues/7",
      board: {
        project: {
          id: "project-1",
          repoOwner: "octo",
          repoName: "repo",
        },
      },
    });
    prismaMock.gitHubIssue.findUnique.mockResolvedValueOnce({ id: "ghi-1" });

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/github/create-issue", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Task already has a linked GitHub issue",
      issueUrl: "https://github.com/octo/repo/issues/7",
    });
    expect(requireGitHubAccessTokenMock).not.toHaveBeenCalled();
  });

  it("creates a GitHub issue, stores linkage, and logs the export", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 7001,
          number: 73,
          html_url: "https://github.com/octo/repo/issues/73",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubTaskAccessMock.mockResolvedValueOnce({
      id: "task-1",
      title: "Improve export flow",
      description: "Make GitHub export idempotent",
      priority: "HIGH",
      board: {
        project: {
          id: "project-1",
          repoOwner: "octo",
          repoName: "repo",
        },
      },
    });
    prismaMock.gitHubIssue.findUnique.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/github/create-issue", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octo/repo/issues",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Improve export flow",
          body: [
            "Make GitHub export idempotent",
            "",
            "---",
            "*Exported from Task Manager — TASK-task-1*",
          ].join("\n"),
          labels: ["priority: high"],
        }),
      },
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionCalls.gitHubIssueCreate).toHaveBeenCalledWith({
      data: {
        githubIssueId: BigInt(7001),
        githubIssueNumber: 73,
        syncDirection: "EXPORTED",
        taskId: "task-1",
        projectId: "project-1",
      },
    });
    expect(transactionCalls.taskUpdate).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { githubIssueUrl: "https://github.com/octo/repo/issues/73" },
    });
    expect(transactionCalls.gitHubSyncLogCreate).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "ISSUE_EXPORTED",
        details: {
          taskId: "task-1",
          issueNumber: 73,
          url: "https://github.com/octo/repo/issues/73",
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      issueNumber: 73,
      url: "https://github.com/octo/repo/issues/73",
    });
  });
});
