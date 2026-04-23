// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ClientDigestCard from "@/app/components/ClientDigestCard";

afterEach(() => {
  cleanup();
});

describe("ClientDigestCard", () => {
  it("loads and renders a client-safe brief on demand", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            source: "rules",
            generatedAt: "2026-04-23T10:00:00.000Z",
            summary:
              "Platform Team currently has 1 project in view with 33% of tracked work completed overall.",
            highlights: [
              "1 task is complete across the visible portfolio.",
              "Roadmap is the furthest along at 33% complete.",
            ],
            risks: [
              "Most visible work is still queued, so the delivery picture may move slowly until more tasks enter progress.",
            ],
            nextSteps: ["Track Roadmap for the next concrete delivery update."],
            snapshot: {
              projectCount: 1,
              totalTasks: 3,
              totalDone: 1,
              totalInProgress: 1,
              totalTodo: 1,
              overallCompletion: 33,
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
    render(<ClientDigestCard orgId="org-1" />);

    await user.click(screen.getByRole("button", { name: /generate brief/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/client/org-1/ai-digest");
    });

    expect(
      await screen.findByText(/Platform Team currently has 1 project in view/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.getByText("Watchouts")).toBeInTheDocument();
    expect(screen.getByText(/Track Roadmap/i)).toBeInTheDocument();
  });
});
