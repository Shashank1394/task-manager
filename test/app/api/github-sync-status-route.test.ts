import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  gitHubIssue: {
    count: vi.fn(),
  },
  gitHubSyncLog: {
    findFirst: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/projects/[projectId]/github-sync/status/route";

describe("github sync status route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.project.findUnique.mockReset();
    prismaMock.gitHubIssue.count.mockReset();
    prismaMock.gitHubSyncLog.findFirst.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 when auth fails", async () => {
    requireAuthMock.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/github-sync/status"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for client-only project access", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organization: {
        members: [{ userId: "user-1", role: "CLIENT" }],
      },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/github-sync/status"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(prismaMock.gitHubIssue.count).not.toHaveBeenCalled();
  });

  it("returns the latest sync summary for project members", async () => {
    const lastSyncedAt = new Date("2026-04-22T09:15:00.000Z");

    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organization: {
        members: [{ userId: "user-1", role: "MEMBER" }],
      },
    });
    prismaMock.gitHubIssue.count.mockResolvedValueOnce(5);
    prismaMock.gitHubSyncLog.findFirst.mockResolvedValueOnce({
      createdAt: lastSyncedAt,
      action: "ISSUE_IMPORTED",
      details: { imported: 3, updated: 2, total: 5 },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/github-sync/status"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      syncedIssues: 5,
      lastSyncedAt: "2026-04-22T09:15:00.000Z",
      lastAction: "ISSUE_IMPORTED",
      lastDetails: { imported: 3, updated: 2, total: 5 },
    });
  });
});
