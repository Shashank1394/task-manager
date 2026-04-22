import { beforeEach, describe, expect, it, vi } from "vitest";
import { badRequest } from "@/lib/api-errors";

const prismaMock = vi.hoisted(() => ({
  gitHubSyncLog: {
    create: vi.fn(),
  },
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

import { POST } from "@/app/api/tasks/[taskId]/github/create-branch/route";

describe("github create branch route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubTaskAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.gitHubSyncLog.create.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    requireGitHubAccessTokenMock.mockResolvedValue("gh-token");
  });

  it("returns helper validation errors before calling GitHub", async () => {
    requireGitHubTaskAccessMock.mockRejectedValueOnce(
      badRequest("GitHub repository not connected"),
    );

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/github/create-branch", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "GitHub repository not connected",
      code: "BAD_REQUEST",
    });
    expect(requireGitHubAccessTokenMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the GitHub branch already exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: "abc123sha" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("already exists", { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubTaskAccessMock.mockResolvedValueOnce({
      id: "task-1",
      title: "Build bell notifications",
      board: {
        project: {
          id: "project-1",
          repoOwner: "octo",
          repoName: "repo",
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/github/create-branch", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Branch already exists",
      branchName: "task/TASK-task-1/build-bell-notifications",
    });
    expect(prismaMock.gitHubSyncLog.create).not.toHaveBeenCalled();
  });

  it("creates a GitHub branch and logs the action", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: "abc123sha" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ref: "refs/heads/task/TASK-task-1/design-kanban-flow",
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
      title: "Design Kanban Flow",
      board: {
        project: {
          id: "project-1",
          repoOwner: "octo",
          repoName: "repo",
        },
      },
    });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request("http://localhost/api/tasks/task-1/github/create-branch", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/octo/repo",
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/octo/repo/git/ref/heads/main",
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/octo/repo/git/refs",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "refs/heads/task/TASK-task-1/design-kanban-flow",
          sha: "abc123sha",
        }),
      },
    );
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "BRANCH_CREATED",
        details: {
          taskId: "task-1",
          branchName: "task/TASK-task-1/design-kanban-flow",
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      branchName: "task/TASK-task-1/design-kanban-flow",
      url: "https://github.com/octo/repo/tree/task/TASK-task-1/design-kanban-flow",
    });
  });
});
