import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  task: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  gitHubSyncLog: {
    create: vi.fn(),
  },
  gitHubIssue: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  gitHubPR: {
    upsert: vi.fn(),
    update: vi.fn(),
  },
  gitHubCommit: {
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/webhooks/github/route";

function createSignature(payload: string, secret: string) {
  return `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex")}`;
}

describe("POST /api/webhooks/github", () => {
  beforeEach(() => {
    prismaMock.project.findFirst.mockReset();
    prismaMock.task.create.mockReset();
    prismaMock.task.findMany.mockReset();
    prismaMock.task.findUnique.mockReset();
    prismaMock.task.update.mockReset();
    prismaMock.gitHubSyncLog.create.mockReset();
    prismaMock.gitHubIssue.findUnique.mockReset();
    prismaMock.gitHubIssue.create.mockReset();
    prismaMock.gitHubIssue.update.mockReset();
    prismaMock.gitHubPR.upsert.mockReset();
    prismaMock.gitHubPR.update.mockReset();
    prismaMock.gitHubCommit.upsert.mockReset();
  });

  it("returns 400 when the event header is missing", async () => {
    const payload = JSON.stringify({
      repository: { owner: { login: "octo" }, name: "repo" },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        body: payload,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing x-github-event header",
    });
  });

  it("returns 401 for invalid signatures without touching task lookups", async () => {
    const payload = JSON.stringify({
      repository: { owner: { login: "octo" }, name: "repo" },
    });

    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      webhookSecret: "top-secret",
      board: { id: "board-1" },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "push",
          "x-github-delivery": "delivery-1",
          "x-hub-signature-256": "sha256=deadbeef",
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature",
    });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    expect(prismaMock.gitHubSyncLog.create).not.toHaveBeenCalled();
  });

  it("acknowledges valid ping events without loading board task ids", async () => {
    const payload = JSON.stringify({
      zen: "Keep it logically awesome.",
      repository: { owner: { login: "octo" }, name: "repo" },
    });

    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      webhookSecret: "top-secret",
      board: { id: "board-1" },
    });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "ping",
          "x-github-delivery": "delivery-2",
          "x-hub-signature-256": createSignature(payload, "top-secret"),
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      event: "ping",
    });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "WEBHOOK_RECEIVED",
        details: {
          event: "ping",
          deliveryId: "delivery-2",
          subtype: "ping",
        },
      },
    });
  });

  it("imports opened issues into project tasks", async () => {
    const payload = JSON.stringify({
      action: "opened",
      issue: {
        id: 42,
        number: 7,
        title: "Ship notifications",
        state: "open",
        html_url: "https://github.com/octo/repo/issues/7",
        body: "Implement in-app bell",
        labels: [{ name: "priority: high" }],
        assignee: null,
      },
      repository: { owner: { login: "octo" }, name: "repo" },
    });

    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      webhookSecret: "top-secret",
      board: { id: "board-1" },
    });
    prismaMock.gitHubIssue.findUnique.mockResolvedValueOnce(null);
    prismaMock.task.create.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.gitHubIssue.create.mockResolvedValueOnce({ id: "ghi-1" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issues",
          "x-github-delivery": "delivery-3",
          "x-hub-signature-256": createSignature(payload, "top-secret"),
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.create).toHaveBeenCalledWith({
      data: {
        title: "Ship notifications",
        description: "Implement in-app bell",
        status: "TODO",
        priority: "HIGH",
        boardId: "board-1",
        githubIssueUrl: "https://github.com/octo/repo/issues/7",
      },
    });
    expect(prismaMock.gitHubIssue.create).toHaveBeenCalledWith({
      data: {
        githubIssueId: BigInt(42),
        githubIssueNumber: 7,
        taskId: "task-1",
        projectId: "project-1",
      },
    });
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "WEBHOOK_RECEIVED",
        details: {
          event: "issues",
          deliveryId: "delivery-3",
          subtype: "issues",
        },
      },
    });
  });

  it("links pull request webhooks to matching tasks and advances TODO tasks", async () => {
    const payload = JSON.stringify({
      action: "opened",
      pull_request: {
        id: 88,
        number: 12,
        title: "TASK-abc123 Add dashboard feed",
        state: "open",
        merged: false,
        merged_at: null,
        html_url: "https://github.com/octo/repo/pull/12",
        body: "Implements TASK-abc123",
        user: { login: "octocat" },
        head: { ref: "feature/TASK-abc123-activity-feed" },
      },
      repository: { owner: { login: "octo" }, name: "repo" },
    });

    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      webhookSecret: "top-secret",
      board: { id: "board-1" },
    });
    prismaMock.task.findMany.mockResolvedValueOnce([{ id: "abc123" }]);
    prismaMock.gitHubPR.upsert.mockResolvedValueOnce({ id: "pr-1" });
    prismaMock.gitHubPR.update.mockResolvedValueOnce({ id: "pr-1" });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "abc123",
      status: "TODO",
    });
    prismaMock.task.update.mockResolvedValueOnce({ id: "abc123" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-2" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-github-delivery": "delivery-4",
          "x-hub-signature-256": createSignature(payload, "top-secret"),
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.task.findMany).toHaveBeenCalledWith({
      where: { boardId: "board-1" },
      select: { id: true },
    });
    expect(prismaMock.gitHubPR.upsert).toHaveBeenCalledWith({
      where: {
        projectId_githubPrNumber: {
          projectId: "project-1",
          githubPrNumber: 12,
        },
      },
      update: { state: "open", title: "TASK-abc123 Add dashboard feed" },
      create: {
        githubPrId: BigInt(88),
        githubPrNumber: 12,
        title: "TASK-abc123 Add dashboard feed",
        state: "open",
        url: "https://github.com/octo/repo/pull/12",
        authorLogin: "octocat",
        projectId: "project-1",
      },
    });
    expect(prismaMock.gitHubPR.update).toHaveBeenCalledWith({
      where: {
        projectId_githubPrNumber: {
          projectId: "project-1",
          githubPrNumber: 12,
        },
      },
      data: { taskId: "abc123" },
    });
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "abc123" },
      data: { status: "IN_PROGRESS" },
    });
  });

  it("links pushed commits to matching tasks", async () => {
    const payload = JSON.stringify({
      ref: "refs/heads/main",
      commits: [
        {
          id: "sha-1",
          message: "TASK-abc123 Wire GitHub sync logs",
          url: "https://github.com/octo/repo/commit/sha-1",
          author: { name: "Shashank", date: "2026-04-22T12:00:00.000Z" },
          timestamp: "2026-04-22T12:00:00.000Z",
        },
      ],
      repository: { owner: { login: "octo" }, name: "repo" },
    });

    prismaMock.project.findFirst.mockResolvedValueOnce({
      id: "project-1",
      webhookSecret: "top-secret",
      board: { id: "board-1" },
    });
    prismaMock.task.findMany.mockResolvedValueOnce([{ id: "abc123" }]);
    prismaMock.gitHubCommit.upsert.mockResolvedValueOnce({ id: "commit-1" });
    prismaMock.gitHubSyncLog.create.mockResolvedValueOnce({ id: "log-3" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "push",
          "x-github-delivery": "delivery-5",
          "x-hub-signature-256": createSignature(payload, "top-secret"),
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.gitHubCommit.upsert).toHaveBeenCalledWith({
      where: {
        projectId_sha: { projectId: "project-1", sha: "sha-1" },
      },
      update: { taskId: "abc123" },
      create: {
        sha: "sha-1",
        message: "TASK-abc123 Wire GitHub sync logs",
        authorName: "Shashank",
        authorDate: new Date("2026-04-22T12:00:00.000Z"),
        url: "https://github.com/octo/repo/commit/sha-1",
        taskId: "abc123",
        projectId: "project-1",
      },
    });
    expect(prismaMock.gitHubSyncLog.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        action: "WEBHOOK_RECEIVED",
        details: {
          event: "push",
          deliveryId: "delivery-5",
          subtype: "push",
        },
      },
    });
  });
});
