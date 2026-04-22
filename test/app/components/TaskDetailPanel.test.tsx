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

import TaskDetailPanel from "@/app/components/TaskDetailPanel";

afterEach(() => {
  cleanup();
});

const taskDetail = {
  id: "task-1",
  title: "Build activity feed",
  description: "Show project history",
  status: "TODO",
  priority: "HIGH",
  dueDate: null,
  estimatedHours: 4,
  loggedHours: 1,
  assigneeId: null,
  assignee: null,
  createdAt: "2026-04-22T10:00:00.000Z",
  comments: [],
  labels: [],
  subtasks: [],
  board: { project: { organizationId: "org-1" } },
  githubIssueUrl: null,
};

const githubData = {
  issue: {
    number: 17,
    url: "https://github.com/octo/repo/issues/17",
    syncDirection: "EXPORTED",
    lastSyncedAt: "2026-04-22T10:00:00.000Z",
  },
  pullRequests: [
    {
      id: "pr-1",
      githubPrNumber: 22,
      title: "Build activity feed",
      state: "open",
      url: "https://github.com/octo/repo/pull/22",
      authorLogin: "octocat",
      createdAt: "2026-04-22T10:00:00.000Z",
    },
  ],
  commits: [],
};

describe("TaskDetailPanel", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("loads task details, members, and GitHub metadata", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url === "/api/tasks/task-1" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(taskDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url === "/api/organizations/org-1/members") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "member-1",
                role: "ADMIN",
                user: {
                  id: "user-2",
                  name: "Alex",
                  email: "alex@example.com",
                  image: null,
                },
              },
            ]),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url === "/api/tasks/task-1/github") {
        return Promise.resolve(
          new Response(JSON.stringify(githubData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TaskDetailPanel
        taskId="task-1"
        onClose={vi.fn()}
        onTaskUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue("Build activity feed"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations/org-1/members",
      );
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/github");
    });

    await userEvent.click(screen.getByRole("button", { name: /github/i }));

    expect(await screen.findByText("Pull Requests (1)")).toBeInTheDocument();
    expect(screen.getByText(/#22 build activity feed/i)).toBeInTheDocument();
  });

  it("saves edited task fields and notifies the parent", async () => {
    const onTaskUpdated = vi.fn();

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url === "/api/tasks/task-1" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(taskDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url === "/api/organizations/org-1/members") {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url === "/api/tasks/task-1/github") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ issue: null, pullRequests: [], commits: [] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url === "/api/tasks/task-1" && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify({ assignee: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TaskDetailPanel
        taskId="task-1"
        onClose={vi.fn()}
        onTaskUpdated={onTaskUpdated}
      />,
    );

    const titleInput = await screen.findByDisplayValue("Build activity feed");
    fireEvent.change(titleInput, { target: { value: "Refine activity feed" } });

    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/tasks/task-1" && init?.method === "PATCH",
    );

    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      title: "Refine activity feed",
      description: "Show project history",
      status: "TODO",
      priority: "HIGH",
      dueDate: null,
      estimatedHours: 4,
      loggedHours: 1,
    });
    expect(onTaskUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-1",
        title: "Refine activity feed",
        status: "TODO",
        priority: "HIGH",
        _count: { comments: 0 },
      }),
    );
  });
});
