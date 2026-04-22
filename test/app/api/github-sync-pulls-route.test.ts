import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden } from "@/lib/api-errors";

const prismaMock = vi.hoisted(() => ({
  task: {
    findMany: vi.fn(),
  },
  gitHubPR: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  gitHubSyncLog: {
    create: vi.fn(),
  },
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

import { POST } from "@/app/api/projects/[projectId]/github-sync/pulls/route";

describe("github sync pulls route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubProjectAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.task.findMany.mockReset();
    prismaMock.gitHubPR.findUnique.mockReset();
    prismaMock.gitHubPR.update.mockReset();
    prismaMock.gitHubPR.create.mockReset();
    prismaMock.gitHubSyncLog.create.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    requireGitHubAccessTokenMock.mockResolvedValue("gh-token");
  });

  it("returns access-control errors from the shared project helper", async () => {
    requireGitHubProjectAccessMock.mockRejectedValueOnce(
      forbidden("Forbidden"),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/github-sync/pulls", {
        method: "POST",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("updates known pull requests and links new ones to matching tasks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 201,
            number: 11,
            title: "TASK-abc123 Polish analytics",
            state: "open",
            html_url: "https://github.com/octo/repo/pull/11",
            user: { login: "octocat" },
            head: { ref: "feature/TASK-abc123-analytics" },
            body: "Refs TASK-abc123",
            merged_at: null,
            created_at: "2026-04-20T08:00:00.000Z",
            updated_at: "2026-04-21T08:00:00.000Z",
          },
          {
            id: 202,
            number: 12,
            title: "Ship sprint chart",
            state: "closed",
            html_url: "https://github.com/octo/repo/pull/12",
            user: { login: "hubot" },
            head: { ref: "feature/TASK-def456-sprint-chart" },
            body: "Closes TASK-def456",
            merged_at: "2026-04-22T08:00:00.000Z",
            created_at: "2026-04-21T08:00:00.000Z",
            updated_at: "2026-04-22T08:00:00.000Z",
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
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "abc123" },
      { id: "def456" },
    ]);
    prismaMock.gitHubPR.findUnique
      .mockResolvedValueOnce({ id: "pr-db-1", taskId: null })
      .mockResolvedValueOnce(null);
    prismaMock.gitHubPR.update.mockResolvedValueOnce({ id: "pr-db-1" });
    prismaMock.gitHubPR.create.mockResolvedValueOnce({ id: "pr-db-2" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/github-sync/pulls", {
        method: "POST",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.github.com/repos/octo/repo/pulls?"),
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
        },
      },
    );
    expect(prismaMock.gitHubPR.update).toHaveBeenCalledWith({
      where: { id: "pr-db-1" },
      data: {
        title: "TASK-abc123 Polish analytics",
        state: "open",
        authorLogin: "octocat",
        taskId: "abc123",
      },
    });
    expect(prismaMock.gitHubPR.create).toHaveBeenCalledWith({
      data: {
        githubPrId: 202,
        githubPrNumber: 12,
        title: "Ship sprint chart",
        state: "merged",
        url: "https://github.com/octo/repo/pull/12",
        authorLogin: "hubot",
        taskId: "def456",
        projectId: "project-1",
      },
    });
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "PR_LINKED",
        details: { linked: 1, updated: 1, total: 2 },
      },
    });
    await expect(response.json()).resolves.toEqual({
      linked: 1,
      updated: 1,
      total: 2,
    });
  });
});
