// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProjectDigestCard from "@/app/components/ProjectDigestCard";

afterEach(() => {
  cleanup();
});

describe("ProjectDigestCard", () => {
  it("loads and renders a generated project brief on demand", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            source: "rules",
            generatedAt: "2026-04-23T10:00:00.000Z",
            summary:
              "Roadmap is running Release Sprint with 1 scoped task done, 1 task in progress, and 1 task still queued.",
            etaReport: {
              projectedCompletionDate: "2026-05-12T12:00:00.000Z",
              confidence: "MEDIUM",
              summary:
                "Roadmap is currently tracking toward May 12, 2026 with medium confidence based on 1/3 tasks complete and 2 still open.",
              assumptions: [
                "Release Sprint remains the main delivery window for the current scope.",
                "Overdue work is closed without adding more than one extra sprint of scope.",
              ],
            },
            highlights: [
              "Release Sprint is the active sprint with 3 tasks scoped.",
              'Latest delivery signal: moved "Backlog setup" from TODO to IN PROGRESS',
            ],
            risks: [
              "1 overdue task needs attention before the schedule slips further.",
            ],
            nextSteps: [
              "Pull the next ready sprint task into progress to keep delivery moving.",
            ],
            snapshot: {
              totalTasks: 3,
              doneTasks: 1,
              inProgressTasks: 1,
              todoTasks: 1,
              overdueTasks: 1,
              unassignedOpenTasks: 0,
              clientCount: 1,
              activeSprintName: "Release Sprint",
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

    const user = userEvent.setup();
    render(<ProjectDigestCard projectId="project-1" />);

    await user.click(
      screen.getByRole("button", { name: /generate ai brief/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/ai-digest",
      );
    });

    expect(
      await screen.findByText(/Roadmap is running Release Sprint/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.getByText("Completion ETA")).toBeInTheDocument();
    expect(screen.getByText("May 12, 2026")).toBeInTheDocument();
    expect(screen.getByText("medium confidence")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 overdue task needs attention before the schedule slips further.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Highlights")).toBeInTheDocument();
    expect(screen.getByText(/Latest delivery signal/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh brief/i }),
    ).toBeInTheDocument();
  });
});
