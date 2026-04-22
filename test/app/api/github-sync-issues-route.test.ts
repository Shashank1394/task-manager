import { beforeEach, describe, expect, it, vi } from "vitest";
import { badRequest } from "@/lib/api-errors";

const txMock = vi.hoisted(() => ({
  gitHubIssue: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  task: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  gitHubIssue: {
    findFirst: vi.fn(),
  },
  gitHubSyncLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireGitHubProjectAccessMock = vi.hoisted(() => vi.fn());
const requireGitHubAccessTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/github-route", () => ({
  requireGitHubProjectAccess: requireGitHubProjectAccessMock,
  requireGitHubAccessToken: requireGitHubAccessTokenMock,
}));

import { POST } from "@/app/api/projects/[projectId]/github-sync/issues/route";

describe("github sync issues route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubProjectAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.gitHubIssue.findFirst.mockReset();
    prismaMock.gitHubSyncLog.create.mockReset();
    prismaMock.$transaction.mockReset();
    txMock.gitHubIssue.findUnique.mockReset();
    txMock.gitHubIssue.update.mockReset();
    txMock.task.create.mockReset();
    txMock.task.update.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    requireGitHubAccessTokenMock.mockResolvedValue("gh-token");
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(txMock),
    );
  });

  it("returns helper validation errors before calling GitHub", async () => {
    requireGitHubProjectAccessMock.mockRejectedValueOnce(
      badRequest("GitHub repository not connected"),
    );

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/issues",
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "GitHub repository not connected",
      code: "BAD_REQUEST",
    });
  });

  it("updates existing linked issues and imports new issues", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 101,
            number: 7,
            title: "Existing issue",
            body: "Refined description",
            state: "closed",
            html_url: "https://github.com/octo/repo/issues/7",
            labels: [{ name: "priority: low" }],
            assignee: null,
            created_at: "2026-04-18T08:00:00.000Z",
          },
          {
            id: 102,
            number: 8,
            title: "Imported issue",
            body: null,
            state: "open",
            html_url: "https://github.com/octo/repo/issues/8",
            labels: [{ name: "p1" }],
            assignee: null,
            created_at: "2026-04-19T08:00:00.000Z",
          },
          {
            id: 103,
            number: 9,
            title: "PR masquerading as issue",
            body: null,
            state: "open",
            html_url: "https://github.com/octo/repo/issues/9",
            labels: [],
            assignee: null,
            created_at: "2026-04-19T09:00:00.000Z",
            pull_request: {},
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
      board: { id: "board-1" },
    });
    prismaMock.gitHubIssue.findFirst.mockResolvedValueOnce({
      lastSyncedAt: new Date("2026-04-20T10:00:00.000Z"),
    });
    txMock.gitHubIssue.findUnique
      .mockResolvedValueOnce({ taskId: "task-1" })
      .mockResolvedValueOnce(null);
    txMock.task.update.mockResolvedValueOnce({ id: "task-1" });
    txMock.gitHubIssue.update.mockResolvedValueOnce({ id: "ghi-1" });
    txMock.task.create.mockResolvedValueOnce({ id: "task-2" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/issues",
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    const fetchUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(fetchUrl).toContain(
      "https://api.github.com/repos/octo/repo/issues?",
    );
    expect(fetchUrl).toContain("since=2026-04-20T10%3A00%3A00.000Z");
    expect(txMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        title: "Existing issue",
        description: "Refined description",
        status: "DONE",
        priority: "LOW",
        githubIssueUrl: "https://github.com/octo/repo/issues/7",
      },
    });
    expect(txMock.gitHubIssue.update).toHaveBeenCalledWith({
      where: { taskId: "task-1" },
      data: { lastSyncedAt: expect.any(Date) },
    });
    expect(txMock.task.create).toHaveBeenCalledWith({
      data: {
        title: "Imported issue",
        description: null,
        status: "TODO",
        priority: "HIGH",
        boardId: "board-1",
        githubIssueUrl: "https://github.com/octo/repo/issues/8",
        githubIssue: {
          create: {
            githubIssueId: 102,
            githubIssueNumber: 8,
            projectId: "project-1",
            syncDirection: "IMPORTED",
          },
        },
      },
    });
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "ISSUE_UPDATED",
        details: { imported: 1, updated: 1, total: 2 },
      },
    });
    await expect(response.json()).resolves.toEqual({
      imported: 1,
      updated: 1,
      total: 2,
    });
  });
});
