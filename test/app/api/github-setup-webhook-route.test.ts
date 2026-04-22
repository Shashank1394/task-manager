import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden } from "@/lib/api-errors";

const prismaMock = vi.hoisted(() => ({
  project: {
    update: vi.fn(),
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

import {
  DELETE,
  POST,
} from "@/app/api/projects/[projectId]/github-sync/setup-webhook/route";

describe("github setup-webhook route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    requireGitHubProjectAccessMock.mockReset();
    requireGitHubAccessTokenMock.mockReset();
    prismaMock.project.update.mockReset();
    prismaMock.gitHubSyncLog.create.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    requireGitHubAccessTokenMock.mockResolvedValue("gh-token");
  });

  it("returns 403 when project access is denied", async () => {
    requireGitHubProjectAccessMock.mockRejectedValueOnce(
      forbidden("Only admins can manage webhooks"),
    );

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/setup-webhook",
        {
          method: "POST",
          body: "{}",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Only admins can manage webhooks",
      code: "FORBIDDEN",
    });
    expect(requireGitHubAccessTokenMock).not.toHaveBeenCalled();
  });

  it("returns 409 when a webhook is already configured", async () => {
    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
      webhookSecret: "secret",
      webhookId: 999,
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/setup-webhook",
        {
          method: "POST",
          body: "{}",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook already configured",
      webhookId: 999,
    });
    expect(requireGitHubAccessTokenMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid webhook setup payloads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
      webhookSecret: null,
      webhookId: null,
    });

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/setup-webhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webhookUrl: "not-a-url" }),
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid webhook setup payload",
      code: "BAD_REQUEST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("creates a webhook and stores the GitHub metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 321 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
      webhookSecret: null,
      webhookId: null,
    });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request(
        "https://app.example.com/api/projects/project-1/github-sync/setup-webhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            webhookUrl: "https://hooks.example.com/github",
          }),
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octo/repo/hooks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        }),
      }),
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual({
      name: "web",
      active: true,
      events: ["issues", "pull_request", "push", "issue_comment"],
      config: {
        url: "https://hooks.example.com/github",
        content_type: "json",
        secret: expect.any(String),
        insecure_ssl: "0",
      },
    });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: {
        webhookSecret: expect.any(String),
        webhookId: 321,
      },
    });
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "WEBHOOK_SETUP",
        details: {
          webhookId: 321,
          events: ["issues", "pull_request", "push", "issue_comment"],
          url: "https://hooks.example.com/github",
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      webhookId: 321,
      active: true,
      events: ["issues", "pull_request", "push", "issue_comment"],
    });
  });

  it("deletes a webhook and clears stored metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    requireGitHubProjectAccessMock.mockResolvedValueOnce({
      id: "project-1",
      repoOwner: "octo",
      repoName: "repo",
      webhookId: 321,
    });
    prismaMock.project.update.mockResolvedValueOnce({ id: "project-1" });

    const response = await DELETE(
      new Request(
        "http://localhost/api/projects/project-1/github-sync/setup-webhook",
        {
          method: "DELETE",
        },
      ),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octo/repo/hooks/321",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer gh-token",
          Accept: "application/vnd.github+json",
        },
      },
    );
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: {
        webhookSecret: null,
        webhookId: null,
      },
    });
    await expect(response.json()).resolves.toEqual({ removed: true });
  });
});
