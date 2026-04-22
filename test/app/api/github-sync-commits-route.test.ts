import { beforeEach, describe, expect, it, vi } from "vitest";
import { badRequest } from "@/lib/api-errors";

const prismaMock = vi.hoisted(() => ({
  task: {
    findMany: vi.fn(),
  },
  gitHubCommit: {
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

import { POST } from "@/app/api/projects/[projectId]/github-sync/commits/route";

describe("github sync commits route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubProjectAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.task.findMany.mockReset();
    prismaMock.gitHubCommit.findUnique.mockReset();
    prismaMock.gitHubCommit.update.mockReset();
    prismaMock.gitHubCommit.create.mockReset();
    prismaMock.gitHubSyncLog.create.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    requireGitHubAccessTokenMock.mockResolvedValue("gh-token");
  });

  it("returns helper validation errors before syncing commits", async () => {
    requireGitHubProjectAccessMock.mockRejectedValueOnce(
      badRequest("GitHub repository not connected"),
    );

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/commits",
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

  it("links new commits and backfills existing unlinked commit records", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            sha: "sha-1",
            commit: {
              message: "TASK-abc123 Refine sync logging",
              author: { name: "Shashank", date: "2026-04-22T10:00:00.000Z" },
            },
            html_url: "https://github.com/octo/repo/commit/sha-1",
          },
          {
            sha: "sha-2",
            commit: {
              message: "TASK-def456 Add sprint metrics",
              author: { name: "Shashank", date: "2026-04-22T11:00:00.000Z" },
            },
            html_url: "https://github.com/octo/repo/commit/sha-2",
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
    prismaMock.gitHubCommit.findUnique
      .mockResolvedValueOnce({ id: "commit-db-1", taskId: null })
      .mockResolvedValueOnce(null);
    prismaMock.gitHubCommit.update.mockResolvedValueOnce({ id: "commit-db-1" });
    prismaMock.gitHubCommit.create.mockResolvedValueOnce({ id: "commit-db-2" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/commits",
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octo/repo/commits?per_page=100",
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
        },
      },
    );
    expect(prismaMock.gitHubCommit.update).toHaveBeenCalledWith({
      where: { id: "commit-db-1" },
      data: { taskId: "abc123" },
    });
    expect(prismaMock.gitHubCommit.create).toHaveBeenCalledWith({
      data: {
        sha: "sha-2",
        message: "TASK-def456 Add sprint metrics",
        authorName: "Shashank",
        authorDate: new Date("2026-04-22T11:00:00.000Z"),
        url: "https://github.com/octo/repo/commit/sha-2",
        taskId: "def456",
        projectId: "project-1",
      },
    });
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "COMMIT_LINKED",
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
