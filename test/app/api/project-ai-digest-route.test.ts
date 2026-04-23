import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/projects/[projectId]/ai-digest/route";

describe("project ai digest route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.project.findFirst.mockReset();
    vi.unstubAllGlobals();
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ollama unavailable"))),
    );

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 404 when the project is not visible to the user", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/ai-digest"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("builds a deterministic brief from project signals", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      description: "Investor-facing delivery board",
      name: "Roadmap",
      clients: [{ id: "client-1" }],
      sprints: [
        {
          id: "sprint-1",
          name: "Release Sprint",
          status: "ACTIVE",
          goal: "Land the showcase flow",
          startDate: new Date("2026-04-20T00:00:00.000Z"),
          endDate: new Date("2026-05-05T12:00:00.000Z"),
        },
      ],
      activities: [
        {
          message: 'moved "Backlog setup" from TODO to IN PROGRESS',
          createdAt: new Date("2026-04-23T09:30:00.000Z"),
        },
      ],
      board: {
        tasks: [
          {
            id: "task-1",
            title: "Backlog setup",
            status: "TODO",
            dueDate: new Date("2000-01-01T00:00:00.000Z"),
            assigneeId: null,
            sprintId: "sprint-1",
            estimatedHours: 6,
            loggedHours: 1,
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
          },
          {
            id: "task-2",
            title: "Ship board interactions",
            status: "IN_PROGRESS",
            dueDate: null,
            assigneeId: "user-2",
            sprintId: "sprint-1",
            estimatedHours: 8,
            loggedHours: 4,
            createdAt: new Date("2026-04-21T00:00:00.000Z"),
          },
          {
            id: "task-3",
            title: "Polish presentation",
            status: "DONE",
            dueDate: null,
            assigneeId: "user-3",
            sprintId: "sprint-1",
            estimatedHours: 4,
            loggedHours: 4,
            createdAt: new Date("2026-04-19T00:00:00.000Z"),
          },
        ],
      },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/ai-digest"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "rules",
      summary: expect.stringContaining("Roadmap is running Release Sprint"),
      highlights: expect.arrayContaining([
        expect.stringContaining("Release Sprint is the active sprint"),
        expect.stringContaining(
          'Latest delivery signal: moved "Backlog setup"',
        ),
      ]),
      risks: expect.arrayContaining([expect.stringContaining("overdue task")]),
      nextSteps: expect.arrayContaining([
        expect.stringContaining("Re-sequence or unblock Backlog setup"),
      ]),
      etaReport: {
        projectedCompletionDate: expect.stringMatching(/^2026-05-/),
        confidence: "MEDIUM",
        summary: expect.stringContaining(
          "Roadmap is currently tracking toward",
        ),
        assumptions: expect.arrayContaining([
          expect.stringContaining(
            "Release Sprint remains the main delivery window",
          ),
        ]),
      },
      snapshot: {
        totalTasks: 3,
        doneTasks: 1,
        inProgressTasks: 1,
        todoTasks: 1,
        overdueTasks: 1,
        unassignedOpenTasks: 1,
        clientCount: 1,
        activeSprintName: "Release Sprint",
      },
    });
  });

  it("prefers an Ollama-generated brief using the dedicated local qwen model", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      description: "Investor-facing delivery board",
      name: "Roadmap",
      clients: [{ id: "client-1" }],
      sprints: [
        {
          id: "sprint-1",
          name: "Release Sprint",
          status: "ACTIVE",
          goal: "Land the showcase flow",
          startDate: new Date("2026-04-20T00:00:00.000Z"),
          endDate: new Date("2026-05-05T12:00:00.000Z"),
        },
      ],
      activities: [
        {
          message: 'moved "Backlog setup" from TODO to IN PROGRESS',
          createdAt: new Date("2026-04-23T09:30:00.000Z"),
        },
      ],
      board: {
        tasks: [
          {
            id: "task-1",
            title: "Backlog setup",
            status: "TODO",
            dueDate: null,
            assigneeId: null,
            sprintId: "sprint-1",
            estimatedHours: 6,
            loggedHours: 1,
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
          },
        ],
      },
    });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  summary: "LLM summary",
                  highlights: ["LLM highlight"],
                  risks: ["LLM risk"],
                  nextSteps: ["LLM next step"],
                }),
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  projectedCompletionDate: "2026-05-09T12:00:00.000Z",
                  confidence: "MEDIUM",
                  summary:
                    "Roadmap is tracking toward May 9, 2026 with medium confidence if the active sprint closes on plan.",
                  assumptions: [
                    "Release Sprint stays the main delivery window.",
                    "Ownership remains stable through the remaining scope.",
                  ],
                }),
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/ai-digest"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"model":"qwen:4b"'),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "llm",
      summary: "LLM summary",
      highlights: ["LLM highlight"],
      risks: ["LLM risk"],
      nextSteps: ["LLM next step"],
      etaReport: {
        projectedCompletionDate: "2026-05-09T12:00:00.000Z",
        confidence: "MEDIUM",
        summary:
          "Roadmap is tracking toward May 9, 2026 with medium confidence if the active sprint closes on plan.",
        assumptions: [
          "Release Sprint stays the main delivery window.",
          "Ownership remains stable through the remaining scope.",
        ],
      },
      snapshot: {
        totalTasks: 1,
        doneTasks: 0,
        inProgressTasks: 0,
        todoTasks: 1,
        overdueTasks: 0,
        unassignedOpenTasks: 1,
        clientCount: 1,
        activeSprintName: "Release Sprint",
      },
    });
  });
});
