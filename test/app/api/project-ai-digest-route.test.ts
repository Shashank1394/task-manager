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
      name: "Roadmap",
      clients: [{ id: "client-1" }],
      sprints: [{ id: "sprint-1", name: "Release Sprint", status: "ACTIVE" }],
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
          },
          {
            id: "task-2",
            title: "Ship board interactions",
            status: "IN_PROGRESS",
            dueDate: null,
            assigneeId: "user-2",
            sprintId: "sprint-1",
          },
          {
            id: "task-3",
            title: "Polish presentation",
            status: "DONE",
            dueDate: null,
            assigneeId: "user-3",
            sprintId: "sprint-1",
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
      name: "Roadmap",
      clients: [{ id: "client-1" }],
      sprints: [{ id: "sprint-1", name: "Release Sprint", status: "ACTIVE" }],
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
          },
        ],
      },
    });

    const fetchMock = vi.fn(() =>
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
