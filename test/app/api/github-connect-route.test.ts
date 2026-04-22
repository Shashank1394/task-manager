import { beforeEach, describe, expect, it, vi } from "vitest";
import { badRequest, forbidden } from "@/lib/api-errors";

const prismaMock = vi.hoisted(() => ({
  project: {
    update: vi.fn(),
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

import { POST } from "@/app/api/projects/[projectId]/connect-github/route";

describe("github connect route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubProjectAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.project.update.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 400 for invalid connection payloads before helper checks", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects/project-1/connect-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoOwner: "", repoName: "repo" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid GitHub connection payload",
      code: "BAD_REQUEST",
    });
    expect(requireGitHubProjectAccessMock).not.toHaveBeenCalled();
  });

  it("returns helper authorization errors", async () => {
    requireGitHubProjectAccessMock.mockRejectedValueOnce(
      forbidden("Forbidden"),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/connect-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoOwner: "octo", repoName: "repo" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
    expect(requireGitHubAccessTokenMock).not.toHaveBeenCalled();
  });

  it("connects the repository and strips a trailing .git suffix", async () => {
    requireGitHubProjectAccessMock.mockResolvedValueOnce({ id: "project-1" });
    requireGitHubAccessTokenMock.mockResolvedValueOnce("gh-token");
    prismaMock.project.update.mockResolvedValueOnce({
      id: "project-1",
      repoProvider: "GITHUB",
      repoOwner: "octo",
      repoName: "repo",
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/connect-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoOwner: "octo", repoName: "repo.git" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(requireGitHubProjectAccessMock).toHaveBeenCalledWith(
      "project-1",
      "user-1",
    );
    expect(requireGitHubAccessTokenMock).toHaveBeenCalledWith(
      "user-1",
      "GitHub not connected",
    );
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: {
        repoProvider: "GITHUB",
        repoOwner: "octo",
        repoName: "repo",
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "project-1",
      repoProvider: "GITHUB",
      repoOwner: "octo",
      repoName: "repo",
    });
  });

  it("returns token helper validation errors", async () => {
    requireGitHubProjectAccessMock.mockResolvedValueOnce({ id: "project-1" });
    requireGitHubAccessTokenMock.mockRejectedValueOnce(
      badRequest("GitHub not connected"),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/connect-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoOwner: "octo", repoName: "repo" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "GitHub not connected",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });
});
