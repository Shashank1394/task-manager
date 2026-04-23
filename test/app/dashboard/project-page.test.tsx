// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useParamsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    src = "",
    ...props
  }: {
    alt?: string;
    src?: string;
  }) => <span aria-label={alt} data-src={src} {...props} />,
}));

vi.mock("@/app/components/ActivityFeed", () => ({
  default: ({ projectId }: { projectId: string }) => (
    <div data-testid="activity-feed">Activity for {projectId}</div>
  ),
}));

vi.mock("@/app/components/TaskDetailPanel", () => ({
  default: ({ taskId }: { taskId: string }) => (
    <div data-testid="task-detail-panel">Task detail for {taskId}</div>
  ),
}));

import ProjectPage from "@/app/dashboard/project/[projectId]/page";

afterEach(() => {
  cleanup();
});

const baseTasks = [
  {
    id: "task-1",
    title: "Backlog setup",
    status: "TODO",
    priority: "HIGH",
    dueDate: null,
    assignee: null,
    _count: { comments: 2 },
    githubIssueUrl: null,
    labels: [],
    sprint: null,
  },
  {
    id: "task-2",
    title: "Ship board interactions",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    dueDate: null,
    assignee: {
      id: "user-2",
      name: "Alex",
      email: "alex@example.com",
      image: null,
    },
    _count: { comments: 0 },
    githubIssueUrl: null,
    labels: [],
    sprint: { id: "sprint-1", name: "Release Sprint", status: "ACTIVE" },
  },
  {
    id: "task-3",
    title: "Polish presentation",
    status: "DONE",
    priority: "LOW",
    dueDate: null,
    assignee: null,
    _count: { comments: 1 },
    githubIssueUrl: null,
    labels: [],
    sprint: null,
  },
] as const;

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("ProjectPage", () => {
  beforeEach(() => {
    useParamsMock.mockReset();
    useParamsMock.mockReturnValue({ projectId: "project-1" });
  });

  it("loads board data and renders task columns", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([
          {
            id: "sprint-1",
            name: "Release Sprint",
            goal: null,
            status: "ACTIVE",
            startDate: null,
            endDate: null,
            _count: { tasks: 1 },
          },
        ]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectPage />);

    expect(screen.getByText("Loading project...")).toBeInTheDocument();
    expect(await screen.findByText("Backlog setup")).toBeInTheDocument();
    expect(screen.getByText("Ship board interactions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /drag backlog setup/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /completed \(1\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /complete sprint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate ai brief/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("activity-feed")).toHaveTextContent(
      "Activity for project-1",
    );
  });

  it("renders sprint analytics, repository health, and client invite history", async () => {
    const sprintAnalyticsTasks = [
      {
        id: "task-1",
        title: "Backlog setup",
        status: "TODO",
        priority: "HIGH",
        dueDate: "2000-01-01T00:00:00.000Z",
        assignee: null,
        _count: { comments: 2 },
        githubIssueUrl: null,
        labels: [],
        sprint: { id: "sprint-1", name: "Release Sprint", status: "ACTIVE" },
      },
      {
        id: "task-2",
        title: "Ship board interactions",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        dueDate: null,
        assignee: {
          id: "user-2",
          name: "Alex",
          email: "alex@example.com",
          image: null,
        },
        _count: { comments: 0 },
        githubIssueUrl: null,
        labels: [],
        sprint: { id: "sprint-1", name: "Release Sprint", status: "ACTIVE" },
      },
      {
        id: "task-3",
        title: "Polish presentation",
        status: "DONE",
        priority: "LOW",
        dueDate: null,
        assignee: null,
        _count: { comments: 1 },
        githubIssueUrl: null,
        labels: [],
        sprint: { id: "sprint-1", name: "Release Sprint", status: "ACTIVE" },
      },
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: true });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(sprintAnalyticsTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([
          {
            id: "client-1",
            createdAt: "2026-04-20T10:00:00.000Z",
            user: {
              id: "user-3",
              name: "Morgan Lee",
              email: "morgan@example.com",
              image: null,
            },
          },
        ]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([
          {
            id: "sprint-1",
            name: "Release Sprint",
            goal: "Ship the investor-ready beta board",
            status: "ACTIVE",
            startDate: "2026-04-20T00:00:00.000Z",
            endDate: "2026-04-30T00:00:00.000Z",
            _count: { tasks: 3 },
          },
        ]);
      }

      if (url === "/api/projects/project-1/github-status") {
        return jsonResponse({
          repository: {
            name: "octo/repo",
            stars: 42,
            forks: 7,
            defaultBranch: "main",
            visibility: "private",
            isArchived: false,
            primaryLanguage: "TypeScript",
            pushedAt: "2026-04-21T09:30:00.000Z",
          },
          latestCommit: {
            message: "Ship GitHub status card",
            author: "Shashank",
            date: "2026-04-22T10:00:00.000Z",
          },
          openPullRequests: 2,
        });
      }

      if (url === "/api/projects/project-1/github-sync/status") {
        return jsonResponse({
          syncedIssues: 5,
          lastSyncedAt: "2026-04-22T09:15:00.000Z",
          lastAction: "ISSUE_UPDATED",
          lastDetails: { imported: 2, updated: 3, total: 5 },
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectPage />);

    const activeSprintOverview = (
      await screen.findByText("Active sprint")
    ).closest(".active-sprint-overview") as HTMLElement;

    expect(
      within(activeSprintOverview).getByText(
        "Ship the investor-ready beta board",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen
          .getByText("Overdue")
          .closest(".active-sprint-metric-card") as HTMLElement,
      ).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Scope burnup")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Issue Updated")).toBeInTheDocument();
    expect(screen.getByText("Morgan Lee")).toBeInTheDocument();
    expect(screen.getByText("Invited Apr 20, 2026")).toBeInTheDocument();
  });

  it("creates a new task from the todo column", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      if (url === "/api/boards/board-1/tasks" && init?.method === "POST") {
        return jsonResponse({
          id: "task-4",
          title: "Document demo flow",
          status: "TODO",
          priority: "MEDIUM",
          dueDate: null,
          assignee: null,
          _count: { comments: 0 },
          githubIssueUrl: null,
          labels: [],
          sprint: null,
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    const taskInputs = await screen.findAllByPlaceholderText("New task...");
    await user.type(taskInputs[0], "Document demo flow{enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/board-1/tasks",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Document demo flow", status: "TODO" }),
        }),
      );
    });

    expect(await screen.findByText("Document demo flow")).toBeInTheDocument();
  });

  it("moves a task forward and allows sprint reassignment from the card", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([
          {
            id: "sprint-1",
            name: "Release Sprint",
            goal: null,
            status: "ACTIVE",
            startDate: null,
            endDate: null,
            _count: { tasks: 1 },
          },
          {
            id: "sprint-2",
            name: "Demo Sprint",
            goal: null,
            status: "PLANNING",
            startDate: null,
            endDate: null,
            _count: { tasks: 0 },
          },
        ]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      if (url === "/api/tasks/task-1" && init?.method === "PATCH") {
        return jsonResponse({ success: true });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    const todoHeading = await screen.findByRole("heading", { name: "TODO" });
    const todoColumn = todoHeading.closest(".column");
    expect(todoColumn).not.toBeNull();

    const todoTaskCard = within(todoColumn as HTMLElement)
      .getByText("Backlog setup")
      .closest(".task-card");
    expect(todoTaskCard).not.toBeNull();

    const sprintSelect = (todoTaskCard as HTMLElement).querySelector(
      ".task-sprint-select",
    ) as HTMLSelectElement | null;
    expect(sprintSelect).not.toBeNull();

    await user.selectOptions(sprintSelect as HTMLSelectElement, "sprint-2");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprintId: "sprint-2" }),
        }),
      );
    });

    expect(sprintSelect).toHaveValue("sprint-2");
    expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Move to IN PROGRESS"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        }),
      );
    });

    const inProgressHeading = screen.getByRole("heading", {
      name: "IN PROGRESS",
    });
    const inProgressColumn = inProgressHeading.closest(".column");
    expect(inProgressColumn).not.toBeNull();
    expect(
      within(inProgressColumn as HTMLElement).getByText("Backlog setup"),
    ).toBeInTheDocument();
  });

  it("reopens a completed task from the completed section", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([
          {
            id: "sprint-1",
            name: "Release Sprint",
            goal: null,
            status: "ACTIVE",
            startDate: null,
            endDate: null,
            _count: { tasks: 1 },
          },
        ]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      if (url === "/api/tasks/task-3" && init?.method === "PATCH") {
        return jsonResponse({ success: true });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    await user.click(
      await screen.findByRole("button", { name: /completed \(1\)/i }),
    );
    const reopenButton = await screen.findByRole("button", { name: /reopen/i });

    await user.click(reopenButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-3",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "TODO" }),
        }),
      );
    });

    expect(
      screen.getByRole("button", { name: /completed \(0\)/i }),
    ).toBeInTheDocument();

    const todoHeading = screen.getByRole("heading", { name: "TODO" });
    const todoColumn = todoHeading.closest(".column");
    expect(todoColumn).not.toBeNull();
    expect(
      within(todoColumn as HTMLElement).getByText("Polish presentation"),
    ).toBeInTheDocument();
  });

  it("deletes a completed task from the completed section", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      if (url === "/api/tasks/task-3" && init?.method === "DELETE") {
        return jsonResponse({ success: true });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    await user.click(
      await screen.findByRole("button", { name: /completed \(1\)/i }),
    );
    const completedItem = await screen.findByText("Polish presentation");
    const deleteButton = within(
      completedItem.closest(".completed-item") as HTMLElement,
    ).getByTitle("Delete task");

    await user.click(deleteButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-3", {
        method: "DELETE",
      });
    });

    expect(screen.queryByText("Polish presentation")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /completed \(0\)/i }),
    ).toBeInTheDocument();
  });

  it("filters board tasks and clears active filters", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([
          {
            id: "sprint-1",
            name: "Release Sprint",
            goal: null,
            status: "ACTIVE",
            startDate: null,
            endDate: null,
            _count: { tasks: 1 },
          },
        ]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    await screen.findByText("Backlog setup");

    await user.type(screen.getByPlaceholderText("Search tasks..."), "backlog");

    const filterSelects = document.querySelectorAll(
      ".filter-bar .filter-select",
    );
    const priorityFilter = filterSelects[0] as HTMLSelectElement;
    expect(priorityFilter).toBeTruthy();

    await user.selectOptions(priorityFilter, "HIGH");

    await waitFor(() => {
      expect(screen.getByText("Backlog setup")).toBeInTheDocument();
      expect(
        screen.queryByText("Ship board interactions"),
      ).not.toBeInTheDocument();
    });

    const clearFiltersButton = screen.getByRole("button", {
      name: /clear filters/i,
    });
    await user.click(clearFiltersButton);

    await waitFor(() => {
      expect(screen.getByText("Ship board interactions")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /clear filters/i }),
    ).not.toBeInTheDocument();
  });

  it("opens task details from the card body but not from the drag handle", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/project-1/sprints") {
        return jsonResponse([]);
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    const dragHandle = await screen.findByRole("button", {
      name: /drag backlog setup/i,
    });
    await user.click(dragHandle);

    expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();

    await user.click(screen.getByText("Backlog setup"));

    expect(await screen.findByTestId("task-detail-panel")).toHaveTextContent(
      "Task detail for task-1",
    );
  });

  it("shows active sprint progress and saves sprint planning details", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/projects/project-1") {
        return jsonResponse({ board: { id: "board-1" }, webhookActive: false });
      }

      if (url === "/api/projects/project-1/tasks") {
        return jsonResponse(baseTasks);
      }

      if (url === "/api/projects/project-1/clients") {
        return jsonResponse([]);
      }

      if (
        url === "/api/projects/project-1/sprints" &&
        (!init?.method || init.method === "GET")
      ) {
        return jsonResponse([
          {
            id: "sprint-1",
            name: "Release Sprint",
            goal: null,
            status: "ACTIVE",
            startDate: null,
            endDate: null,
            _count: { tasks: 1 },
          },
        ]);
      }

      if (
        url === "/api/projects/project-1/sprints" &&
        init?.method === "PATCH"
      ) {
        return jsonResponse({
          id: "sprint-1",
          name: "Release Sprint",
          goal: "Ship the polished capstone walkthrough",
          status: "ACTIVE",
          startDate: "2026-04-22T00:00:00.000Z",
          endDate: "2026-04-29T00:00:00.000Z",
          _count: { tasks: 1 },
        });
      }

      if (
        url === "/api/projects/project-1/github-status" ||
        url === "/api/projects/project-1/github-sync/status"
      ) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProjectPage />);

    expect(await screen.findByText("Active sprint")).toBeInTheDocument();
    expect(screen.getByText("0/1 tasks done")).toBeInTheDocument();
    expect(screen.getByText("0% complete")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /plan sprint/i }));

    await user.clear(screen.getByLabelText("Sprint goal"));
    await user.type(
      screen.getByLabelText("Sprint goal"),
      "Ship the polished capstone walkthrough",
    );
    await user.type(screen.getByLabelText("Start date"), "2026-04-22");
    await user.type(screen.getByLabelText("End date"), "2026-04-29");

    await user.click(screen.getByRole("button", { name: /save plan/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/sprints",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sprintId: "sprint-1",
            name: "Release Sprint",
            goal: "Ship the polished capstone walkthrough",
            startDate: "2026-04-22",
            endDate: "2026-04-29",
          }),
        }),
      );
    });

    const activeSprintOverview = screen
      .getByText("Active sprint")
      .closest(".active-sprint-overview") as HTMLElement;

    expect(
      within(activeSprintOverview).getByText(
        "Ship the polished capstone walkthrough",
      ),
    ).toBeInTheDocument();
    expect(
      within(activeSprintOverview).getByText("Apr 22 - Apr 29"),
    ).toBeInTheDocument();
  });
});
