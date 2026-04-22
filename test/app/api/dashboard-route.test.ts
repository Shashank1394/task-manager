import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findMany: vi.fn(),
  },
  sprint: {
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/dashboard/route";

describe("dashboard route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organizationMember.findMany.mockReset();
    prismaMock.sprint.findMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 for auth failures through the shared error handler", async () => {
    requireAuthMock.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("returns aggregated dashboard data for non-client memberships", async () => {
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([
      {
        organization: {
          name: "Platform Team",
          projects: [
            {
              id: "project-1",
              name: "Roadmap",
              board: {
                tasks: [
                  {
                    id: "task-1",
                    title: "Task one",
                    status: "TODO",
                    priority: "HIGH",
                    assigneeId: "user-1",
                    createdAt: "2026-04-22T10:00:00.000Z",
                    dueDate: "2026-04-23T10:00:00.000Z",
                    estimatedHours: 3,
                    loggedHours: 1,
                    board: {
                      project: { id: "project-1", name: "Roadmap" },
                    },
                  },
                  {
                    id: "task-2",
                    title: "Task two",
                    status: "DONE",
                    priority: "LOW",
                    assigneeId: null,
                    createdAt: "2026-04-20T10:00:00.000Z",
                    dueDate: null,
                    estimatedHours: 2,
                    loggedHours: 2,
                    board: {
                      project: { id: "project-1", name: "Roadmap" },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    prismaMock.sprint.findMany.mockResolvedValueOnce([
      {
        id: "sprint-1",
        name: "Sprint 1",
        endDate: "2026-04-30T00:00:00.000Z",
        project: { id: "project-1", name: "Roadmap" },
        tasks: [{ status: "DONE" }, { status: "TODO" }],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalTasks: 2,
      byStatus: { TODO: 1, IN_PROGRESS: 0, DONE: 1 },
      byPriority: { HIGH: 1, MEDIUM: 0, LOW: 1 },
      myActiveTasks: [
        {
          id: "task-1",
          title: "Task one",
          status: "TODO",
          priority: "HIGH",
          projectName: "Roadmap",
          projectId: "project-1",
          estimatedHours: 3,
          loggedHours: 1,
          dueDate: "2026-04-23T10:00:00.000Z",
        },
      ],
      recentCompleted: [
        {
          id: "task-2",
          title: "Task two",
          projectName: "Roadmap",
        },
      ],
      projectSummaries: [
        {
          id: "project-1",
          name: "Roadmap",
          orgName: "Platform Team",
          totalTasks: 2,
          completedTasks: 1,
          completionPct: 50,
          estimatedHours: 5,
          loggedHours: 3,
        },
      ],
      orgCount: 1,
      overdueTasks: [],
      dueSoonTasks: [
        {
          id: "task-1",
          title: "Task one",
          dueDate: "2026-04-23T10:00:00.000Z",
          status: "TODO",
          priority: "HIGH",
          projectName: "Roadmap",
          projectId: "project-1",
        },
      ],
      activeSprints: [
        {
          id: "sprint-1",
          name: "Sprint 1",
          endDate: "2026-04-30T00:00:00.000Z",
          projectName: "Roadmap",
          projectId: "project-1",
          totalTasks: 2,
          completedTasks: 1,
        },
      ],
      timeTracking: {
        totalEstimated: 5,
        totalLogged: 3,
      },
    });
  });

  it("returns 500 for unexpected dashboard failures", async () => {
    prismaMock.organizationMember.findMany.mockRejectedValueOnce(
      new Error("db down"),
    );

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
