// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useParamsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

import ClientDashboardPage from "@/app/dashboard/client/[orgId]/page";

afterEach(() => {
  cleanup();
});

const jsonResponse = (payload: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("ClientDashboardPage", () => {
  beforeEach(() => {
    useParamsMock.mockReset();
    useParamsMock.mockReturnValue({ orgId: "org-1" });
  });

  it("renders client project cards as in-page jump targets with progress summaries", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/client/org-1/dashboard") {
        return jsonResponse({
          organization: { id: "org-1", name: "Client Org" },
          overview: {
            totalTasks: 3,
            totalDone: 1,
            totalInProgress: 1,
            totalTodo: 1,
            overallCompletion: 33,
            projectCount: 1,
          },
          projects: [
            {
              id: "project-1",
              name: "Roadmap",
              total: 3,
              todo: 1,
              inProgress: 1,
              done: 1,
              completionPct: 33,
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientDashboardPage />);

    const projectHeading = await screen.findByRole("heading", {
      name: "Roadmap",
    });

    expect(projectHeading.closest(".client-project-card")).toHaveAttribute(
      "id",
      "client-project-project-1",
    );
    expect(screen.getByText("1 of 3 tasks completed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate brief/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /a focused delivery snapshot with current progress across the projects/i,
      ),
    ).toBeInTheDocument();
  });
});
