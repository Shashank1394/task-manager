import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { POST } from "@/app/api/projects/[projectId]/ai-task-draft/route";

describe("project ai task draft route", () => {
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

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/ai-task-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: "Prepare the investor demo flow this week.",
        }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("builds a deterministic task draft from rough project notes", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      name: "Roadmap",
      description: "Investor-facing delivery board",
      sprints: [
        {
          id: "sprint-1",
          name: "Demo Sprint",
          status: "ACTIVE",
          goal: "Land the presentation flow",
        },
      ],
      board: {
        tasks: [
          { title: "Polish presentation", status: "TODO", priority: "MEDIUM" },
        ],
      },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/ai-task-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText:
            "Prepare the investor demo flow this week.\nInclude signup, board drag-and-drop, and the AI brief in the walkthrough.",
        }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "rules",
      draft: {
        title: "Prepare the investor demo flow this week",
        priority: "HIGH",
        status: "TODO",
        description: expect.stringContaining(
          "Prepare the investor demo flow this week.",
        ),
        acceptanceCriteria: expect.arrayContaining([
          expect.stringContaining("Include signup, board drag-and-drop"),
        ]),
      },
      snapshot: {
        projectName: "Roadmap",
        activeSprintName: "Demo Sprint",
      },
    });
  });

  it("prefers an Ollama-generated task draft using the dedicated local qwen model", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce({
      name: "Roadmap",
      description: "Investor-facing delivery board",
      sprints: [
        {
          id: "sprint-1",
          name: "Demo Sprint",
          status: "ACTIVE",
          goal: "Land the presentation flow",
        },
      ],
      board: {
        tasks: [
          { title: "Polish presentation", status: "TODO", priority: "MEDIUM" },
        ],
      },
    });

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                title: "Finalize investor walkthrough",
                description:
                  "Package the investor-ready flow so the presentation shows signup, board movement, and the AI summary in one pass.",
                priority: "HIGH",
                status: "TODO",
                acceptanceCriteria: [
                  "Signup is included in the walkthrough.",
                  "Board drag-and-drop is visible in the demo.",
                ],
                reasoning:
                  "The note is time-sensitive and tied to a presentation, so it should stay high priority.",
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

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/ai-task-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText:
            "Prepare the investor demo flow this week. Include signup, board drag-and-drop, and the AI brief in the walkthrough.",
        }),
      }),
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
      draft: {
        title: "Finalize investor walkthrough",
        priority: "HIGH",
        status: "TODO",
        acceptanceCriteria: [
          "Signup is included in the walkthrough.",
          "Board drag-and-drop is visible in the demo.",
        ],
      },
    });
  });
});
