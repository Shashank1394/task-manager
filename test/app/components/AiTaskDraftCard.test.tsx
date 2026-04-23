// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AiTaskDraftCard from "@/app/components/AiTaskDraftCard";

afterEach(() => {
  cleanup();
});

describe("AiTaskDraftCard", () => {
  it("generates an AI draft and creates a task from it", async () => {
    const onTaskCreated = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url === "/api/projects/project-1/ai-task-draft" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "llm",
              generatedAt: "2026-04-23T10:00:00.000Z",
              draft: {
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
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url === "/api/boards/board-1/tasks" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "task-99",
              title: "Finalize investor walkthrough",
              status: "TODO",
              priority: "HIGH",
              dueDate: null,
              assignee: null,
              _count: { comments: 0 },
              githubIssueUrl: null,
              labels: [],
              sprint: null,
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <AiTaskDraftCard
        projectId="project-1"
        boardId="board-1"
        onTaskCreated={onTaskCreated}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/Paste a meeting note/i),
      "Prepare the investor demo flow this week. Include signup, board drag-and-drop, and the AI brief in the walkthrough.",
    );
    await user.click(screen.getByRole("button", { name: /generate draft/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/ai-task-draft",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawText:
              "Prepare the investor demo flow this week. Include signup, board drag-and-drop, and the AI brief in the walkthrough.",
          }),
        }),
      );
    });

    expect(
      await screen.findByText("Finalize investor walkthrough"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ollama")).toBeInTheDocument();
    expect(
      screen.getByText(/time-sensitive and tied to a presentation/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /create task from draft/i }),
    );

    await waitFor(() => {
      const boardCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/boards/board-1/tasks" &&
          (init as RequestInit | undefined)?.method === "POST",
      );

      expect(boardCall).toBeTruthy();

      const payload = JSON.parse(
        ((boardCall?.[1] as RequestInit).body as string) || "{}",
      );

      expect(payload).toMatchObject({
        title: "Finalize investor walkthrough",
        priority: "HIGH",
        status: "TODO",
      });
      expect(payload.description).toContain("Acceptance criteria:");
      expect(payload.description).toContain(
        "Signup is included in the walkthrough.",
      );
    });

    expect(onTaskCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-99",
        title: "Finalize investor walkthrough",
      }),
    );
    expect(
      await screen.findByText(
        'Created "Finalize investor walkthrough" in TODO.',
      ),
    ).toBeInTheDocument();
  });
});
