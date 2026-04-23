// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => usePathnameMock(),
}));

import Topbar from "@/app/components/layout/Topbar";

afterEach(() => {
  cleanup();
});

describe("Topbar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/dashboard");
    vi.useRealTimers();
  });

  it("debounces search requests and navigates from a project result", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ notifications: [], unreadCount: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url === "/api/search?q=road") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tasks: [],
              projects: [
                {
                  id: "project-1",
                  name: "Roadmap",
                  organization: { name: "Platform Team" },
                },
              ],
              members: [],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<Topbar />);

    const input = screen.getByPlaceholderText(
      "Search tasks, projects, people...",
    );
    await user.type(input, "road");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/search?q=road");
    });

    const projectResult = await screen.findByRole("button", {
      name: /roadmap/i,
    });
    expect(projectResult).toBeInTheDocument();

    await user.click(projectResult);

    expect(pushMock).toHaveBeenCalledWith("/dashboard/project/project-1");
  });

  it("does not search for queries shorter than two characters", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ notifications: [], unreadCount: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Topbar />);

    fireEvent.change(
      screen.getByPlaceholderText("Search tasks, projects, people..."),
      { target: { value: "a" } },
    );

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/no results for/i)).not.toBeInTheDocument();
  });
});
