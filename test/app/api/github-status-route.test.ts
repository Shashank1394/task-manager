import { beforeEach, describe, expect, it, vi } from "vitest";
import { badRequest, forbidden } from "@/lib/api-errors";

const requireAuthMock = vi.hoisted(() => vi.fn());
const requireGitHubProjectAccessMock = vi.hoisted(() => vi.fn());
const requireGitHubAccessTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/github-route", () => ({
  requireGitHubProjectAccess: requireGitHubProjectAccessMock,
  requireGitHubAccessToken: requireGitHubAccessTokenMock,
}));

import { GET } from "@/app/api/projects/[projectId]/github-status/route";

describe("github status route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubProjectAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns helper access errors instead of collapsing them to 401", async () => {
    requireGitHubProjectAccessMock.mockRejectedValueOnce(
      forbidden("Forbidden"),
    );

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/github-status"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("returns token helper validation errors", async () => {
    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
    });
    requireGitHubAccessTokenMock.mockRejectedValueOnce(
      badRequest("GitHub not connected"),
    );

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/github-status"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "GitHub not connected",
      code: "BAD_REQUEST",
    });
  });

  it("returns repository health, latest commit, and open pull count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            full_name: "octo/repo",
            stargazers_count: 42,
            forks_count: 7,
            default_branch: "main",
            visibility: "private",
            archived: false,
            language: "TypeScript",
            pushed_at: "2026-04-21T09:30:00.000Z",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              commit: {
                message: "Ship GitHub status card",
                author: {
                  name: "Shashank",
                  date: "2026-04-22T10:00:00.000Z",
                },
              },
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
    });
    requireGitHubAccessTokenMock.mockResolvedValueOnce("gh-token");

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/github-status"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/octo/repo",
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/octo/repo/commits?per_page=1",
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/octo/repo/pulls?state=open",
      {
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
        },
      },
    );
    await expect(response.json()).resolves.toEqual({
      repository: {
        name: "octo/repo",
        stars: 42,
        forks: 7,
        defaultBranch: "main",
        visibility: "private",
        isArchived: false,
        primaryLanguage: "TypeScript",
        pushedAt: "2026-04-21T09:30:00.000Z",
      },
      latestCommit: {
        message: "Ship GitHub status card",
        author: "Shashank",
        date: "2026-04-22T10:00:00.000Z",
      },
      openPullRequests: 2,
    });
  });
});
