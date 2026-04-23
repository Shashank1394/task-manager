"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import TaskDetailPanel from "@/app/components/TaskDetailPanel";
import ActivityFeed from "@/app/components/ActivityFeed";
import AiTaskDraftCard from "@/app/components/AiTaskDraftCard";
import ProjectDigestCard from "@/app/components/ProjectDigestCard";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Task = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  assignee: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  _count: { comments: number };
  githubIssueUrl: string | null;
  labels: { id: string; name: string; color: string }[];
  sprint: { id: string; name: string; status: string } | null;
};

type Sprint = {
  id: string;
  name: string;
  goal: string | null;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";
  startDate: string | null;
  endDate: string | null;
  _count: { tasks: number };
};

type GitHubStatus = {
  repository: {
    name: string;
    stars: number;
    forks: number;
    defaultBranch: string;
    visibility: string;
    isArchived: boolean;
    primaryLanguage: string | null;
    pushedAt: string | null;
  };
  latestCommit: {
    message: string;
    author: string;
    date: string;
  } | null;
  openPullRequests: number;
};

type SyncStatus = {
  syncedIssues: number;
  lastSyncedAt: string | null;
  lastAction: string | null;
  lastDetails: { imported: number; updated: number; total: number } | null;
};

type ProjectClient = {
  id: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type SprintDraft = {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
};

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatSprintWindow(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) {
    return null;
  }

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  if (startDate) {
    return `Starts ${formatDate(startDate)}`;
  }

  return `Ends ${formatDate(endDate!)}`;
}

function createSprintDraft(sprint: Sprint): SprintDraft {
  return {
    name: sprint.name,
    goal: sprint.goal ?? "",
    startDate: toDateInputValue(sprint.startDate),
    endDate: toDateInputValue(sprint.endDate),
  };
}

function formatDisplayDate(
  value: string | null,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", options);
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatSyncAction(action: string | null) {
  return action ? formatLabel(action) : "No sync activity yet";
}

function getSprintElapsedPercent(
  startDate: string | null,
  endDate: string | null,
) {
  if (!startDate || !endDate) {
    return null;
  }

  const startTimestamp = new Date(startDate).getTime();
  const endTimestamp = new Date(endDate).getTime();

  if (
    Number.isNaN(startTimestamp) ||
    Number.isNaN(endTimestamp) ||
    endTimestamp <= startTimestamp
  ) {
    return null;
  }

  const currentTimestamp = Date.now();

  if (currentTimestamp <= startTimestamp) {
    return 0;
  }

  if (currentTimestamp >= endTimestamp) {
    return 100;
  }

  return Math.round(
    ((currentTimestamp - startTimestamp) / (endTimestamp - startTimestamp)) *
      100,
  );
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const projectIdParam = Array.isArray(projectId) ? projectId[0] : projectId;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingPRs, setSyncingPRs] = useState(false);
  const [syncingCommits, setSyncingCommits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webhookActive, setWebhookActive] = useState(false);
  const [settingUpWebhook, setSettingUpWebhook] = useState(false);

  // Connect GitHub repo
  const [repoUrl, setRepoUrl] = useState("");
  const [connectingRepo, setConnectingRepo] = useState(false);
  const [connectError, setConnectError] = useState("");

  const [newTask, setNewTask] = useState<{ [key: string]: string }>({});
  const [boardId, setBoardId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Client management
  const [clients, setClients] = useState<ProjectClient[]>([]);
  const [clientEmail, setClientEmail] = useState("");
  const [clientError, setClientError] = useState("");
  const [invitingClient, setInvitingClient] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterAssignee, setFilterAssignee] = useState<string>("ALL");
  const [filterSprint, setFilterSprint] = useState<string>("ALL");

  // Sprints
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [newSprintName, setNewSprintName] = useState("");
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [sprintDraft, setSprintDraft] = useState<SprintDraft | null>(null);
  const [savingSprintId, setSavingSprintId] = useState<string | null>(null);
  const [sprintPlanError, setSprintPlanError] = useState("");

  // @dnd-kit sensors — require 5px movement before activating to allow clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || `Request failed with status ${res.status}`);
    }

    if (!contentType.includes("application/json")) {
      const body = await res.text();
      throw new Error(`Expected JSON but got: ${body.slice(0, 120)}`);
    }

    return (await res.json()) as T;
  };

  useEffect(() => {
    if (!projectIdParam) {
      return;
    }

    Promise.all([
      fetchJson<{ board: { id: string }; webhookActive: boolean }>(
        `/api/projects/${projectIdParam}`,
      ),
      fetchJson<Task[]>(`/api/projects/${projectIdParam}/tasks`),
      fetchJson<GitHubStatus>(
        `/api/projects/${projectIdParam}/github-status`,
      ).catch(() => null),
      fetchJson<SyncStatus>(
        `/api/projects/${projectIdParam}/github-sync/status`,
      ).catch(() => null),
      fetchJson<ProjectClient[]>(
        `/api/projects/${projectIdParam}/clients`,
      ).catch(() => [] as ProjectClient[]),
      fetchJson<Sprint[]>(`/api/projects/${projectIdParam}/sprints`).catch(
        () => [] as Sprint[],
      ),
    ])
      .then(
        ([
          projectData,
          taskData,
          githubData,
          syncData,
          clientData,
          sprintData,
        ]) => {
          setBoardId(projectData.board.id);
          setWebhookActive(projectData.webhookActive);
          setTasks(taskData);
          setGithub(githubData);
          setSyncStatus(syncData);
          setClients(clientData);
          setSprints(sprintData);
        },
      )
      .catch((error) => {
        console.error("Failed to load project page data:", error);
      })
      .finally(() => setLoading(false));
  }, [projectIdParam]);

  if (!projectIdParam) {
    return <p>Invalid project id</p>;
  }

  const createTask = async (status: string) => {
    if (!boardId) return;

    const title = newTask[status]?.trim();
    if (!title || title.length < 3) return;

    const res = await fetch(`/api/boards/${boardId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, status }),
    });

    if (!res.ok) {
      console.error(await res.text());
      return;
    }

    const task = await res.json();

    setTasks((prev) => [...prev, task]);

    setNewTask((prev) => ({
      ...prev,
      [status]: "",
    }));
  };

  const statusOrder: Task["status"][] = ["TODO", "IN_PROGRESS", "DONE"];

  const handleTaskUpdated = (updated: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
    );
  };

  const completeTask = async (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: "DONE" as const } : t,
      ),
    );

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });

    if (!res.ok) {
      const taskData = await fetchJson<Task[]>(
        `/api/projects/${projectIdParam}/tasks`,
      );
      setTasks(taskData);
      console.error("Failed to complete task");
    }
  };

  const deleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) {
      // Revert on failure — re-fetch tasks
      const taskData = await fetchJson<Task[]>(
        `/api/projects/${projectIdParam}/tasks`,
      );
      setTasks(taskData);
      console.error("Failed to delete task");
    }
  };

  const moveTask = async (taskId: string, newStatus: Task["status"]) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    );

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!res.ok) {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status:
                  statusOrder[
                    statusOrder.indexOf(newStatus) === 0
                      ? 0
                      : statusOrder.indexOf(newStatus)
                  ],
              }
            : t,
        ),
      );
      console.error("Failed to move task:", await res.text());
    }
  };

  const importGitHubIssues = async () => {
    if (syncing) return;
    setSyncing(true);

    try {
      const res = await fetch(
        `/api/projects/${projectIdParam}/github-sync/issues`,
        { method: "POST" },
      );

      if (!res.ok) {
        const data = await res.json();
        console.error("Import failed:", data.error);
        return;
      }

      // Refresh tasks and sync status
      const [taskData, syncData] = await Promise.all([
        fetchJson<Task[]>(`/api/projects/${projectIdParam}/tasks`),
        fetchJson<SyncStatus>(
          `/api/projects/${projectIdParam}/github-sync/status`,
        ),
      ]);
      setTasks(taskData);
      setSyncStatus(syncData);
    } catch (error) {
      console.error("Import failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const syncPullRequests = async () => {
    if (syncingPRs) return;
    setSyncingPRs(true);
    try {
      const res = await fetch(
        `/api/projects/${projectIdParam}/github-sync/pulls`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json();
        console.error("PR sync failed:", data.error);
        return;
      }
      const [taskData, syncData] = await Promise.all([
        fetchJson<Task[]>(`/api/projects/${projectIdParam}/tasks`),
        fetchJson<SyncStatus>(
          `/api/projects/${projectIdParam}/github-sync/status`,
        ),
      ]);
      setTasks(taskData);
      setSyncStatus(syncData);
    } catch (error) {
      console.error("PR sync failed:", error);
    } finally {
      setSyncingPRs(false);
    }
  };

  const syncCommits = async () => {
    if (syncingCommits) return;
    setSyncingCommits(true);
    try {
      const res = await fetch(
        `/api/projects/${projectIdParam}/github-sync/commits`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json();
        console.error("Commit sync failed:", data.error);
        return;
      }
      const syncData = await fetchJson<SyncStatus>(
        `/api/projects/${projectIdParam}/github-sync/status`,
      );
      setSyncStatus(syncData);
    } catch (error) {
      console.error("Commit sync failed:", error);
    } finally {
      setSyncingCommits(false);
    }
  };

  const setupWebhook = async () => {
    if (settingUpWebhook) return;

    let webhookUrl: string | undefined;
    if (window.location.hostname === "localhost") {
      const url = prompt(
        "GitHub can't reach localhost. Enter a public URL (e.g. from ngrok or smee.io):\n\n" +
          "Run: ngrok http 3000\nThen paste the https URL here.\n\n" +
          "The path /api/webhooks/github will be appended automatically.",
      );
      if (!url) return;
      webhookUrl = url.replace(/\/+$/, "") + "/api/webhooks/github";
    }

    setSettingUpWebhook(true);
    try {
      const res = await fetch(
        `/api/projects/${projectIdParam}/github-sync/setup-webhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookUrl ? { webhookUrl } : {}),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        console.error("Webhook setup failed:", data.error);
        if (data.hint) {
          alert(data.hint);
        }
        return;
      }
      setWebhookActive(true);
    } catch (error) {
      console.error("Webhook setup failed:", error);
    } finally {
      setSettingUpWebhook(false);
    }
  };

  const removeWebhook = async () => {
    if (settingUpWebhook) return;
    setSettingUpWebhook(true);
    try {
      const res = await fetch(
        `/api/projects/${projectIdParam}/github-sync/setup-webhook`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        console.error("Webhook removal failed:", data.error);
        return;
      }
      setWebhookActive(false);
    } catch (error) {
      console.error("Webhook removal failed:", error);
    } finally {
      setSettingUpWebhook(false);
    }
  };

  const syncAll = async () => {
    await importGitHubIssues();
    await syncPullRequests();
    await syncCommits();
  };

  const connectRepo = async () => {
    if (connectingRepo || !repoUrl.trim()) return;
    setConnectError("");
    setConnectingRepo(true);
    try {
      // Parse owner/repo from URL or "owner/repo" format
      const trimmed = repoUrl.trim().replace(/\/+$/, "");
      let owner: string | undefined;
      let repo: string | undefined;

      const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (urlMatch) {
        owner = urlMatch[1];
        repo = urlMatch[2].replace(/\.git$/, "");
      } else if (/^[^/]+\/[^/]+$/.test(trimmed)) {
        [owner, repo] = trimmed.split("/");
      }

      if (!owner || !repo) {
        setConnectError("Enter a GitHub URL or owner/repo format");
        return;
      }

      const res = await fetch(
        `/api/projects/${projectIdParam}/connect-github`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoOwner: owner, repoName: repo }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setConnectError(data.error || "Failed to connect repository");
        return;
      }

      // Refresh GitHub data
      const [ghData, syncData] = await Promise.all([
        fetchJson<GitHubStatus>(
          `/api/projects/${projectIdParam}/github-status`,
        ).catch(() => null),
        fetchJson<SyncStatus>(
          `/api/projects/${projectIdParam}/github-sync/status`,
        ).catch(() => null),
      ]);
      setGithub(ghData);
      setSyncStatus(syncData);
      setRepoUrl("");
    } catch {
      setConnectError("Failed to connect repository");
    } finally {
      setConnectingRepo(false);
    }
  };

  const applyUpdatedSprintToState = (
    updated: Sprint,
    options?: { completeOtherActiveSprints?: boolean },
  ) => {
    const shouldCompleteOtherActiveSprints =
      options?.completeOtherActiveSprints ?? false;

    setSprints((prev) =>
      prev.map((s) => {
        if (s.id === updated.id) return updated;

        if (shouldCompleteOtherActiveSprints && s.status === "ACTIVE") {
          return { ...s, status: "COMPLETED" as const };
        }

        return s;
      }),
    );

    setTasks((prev) =>
      prev.map((task) => {
        if (!task.sprint) return task;

        if (task.sprint.id === updated.id) {
          return {
            ...task,
            sprint: {
              id: updated.id,
              name: updated.name,
              status: updated.status,
            },
          };
        }

        if (
          shouldCompleteOtherActiveSprints &&
          task.sprint.status === "ACTIVE"
        ) {
          return {
            ...task,
            sprint: { ...task.sprint, status: "COMPLETED" as const },
          };
        }

        return task;
      }),
    );
  };

  const patchSprint = async (
    sprintId: string,
    updates: Partial<
      Pick<Sprint, "name" | "status" | "startDate" | "endDate" | "goal">
    >,
  ) => {
    try {
      const res = await fetch(`/api/projects/${projectIdParam}/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId, ...updates }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return {
          ok: false as const,
          message: data?.error || "Failed to update sprint",
        };
      }

      const updated: Sprint = await res.json();
      applyUpdatedSprintToState(updated, {
        completeOtherActiveSprints: updates.status === "ACTIVE",
      });
      return { ok: true as const, sprint: updated };
    } catch {
      return { ok: false as const, message: "Failed to update sprint" };
    }
  };

  const startEditingSprint = (sprint: Sprint) => {
    setEditingSprintId(sprint.id);
    setSprintDraft(createSprintDraft(sprint));
    setSprintPlanError("");
  };

  const cancelEditingSprint = () => {
    setEditingSprintId(null);
    setSprintDraft(null);
    setSprintPlanError("");
  };

  const inviteClient = async () => {
    if (invitingClient || !clientEmail.trim()) return;
    setClientError("");
    setInvitingClient(true);
    try {
      const res = await fetch(`/api/projects/${projectIdParam}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clientEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setClientError(data.error || "Failed to invite client");
        return;
      }
      const newClient = await res.json();
      setClients((prev) => [newClient, ...prev]);
      setClientEmail("");
    } catch {
      setClientError("Failed to invite client");
    } finally {
      setInvitingClient(false);
    }
  };

  const removeClient = async (clientRecordId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectIdParam}/clients`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientRecordId }),
      });
      if (res.ok) {
        setClients((prev) => prev.filter((c) => c.id !== clientRecordId));
      }
    } catch {
      console.error("Failed to remove client");
    }
  };

  // Sprint handlers
  const createSprint = async () => {
    if (!newSprintName.trim() || creatingSprint) return;
    setCreatingSprint(true);
    try {
      const res = await fetch(`/api/projects/${projectIdParam}/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSprintName.trim() }),
      });
      if (res.ok) {
        const sprint: Sprint = await res.json();
        setSprints((prev) => [sprint, ...prev]);
        setNewSprintName("");
        startEditingSprint(sprint);
      }
    } catch {
      console.error("Failed to create sprint");
    } finally {
      setCreatingSprint(false);
    }
  };

  const updateSprint = async (
    sprintId: string,
    updates: Partial<
      Pick<Sprint, "name" | "status" | "startDate" | "endDate" | "goal">
    >,
  ) => {
    const result = await patchSprint(sprintId, updates);
    if (!result.ok) {
      console.error(result.message);
    }
  };

  const saveSprintPlan = async (sprintId: string) => {
    if (!sprintDraft) return;

    const name = sprintDraft.name.trim();
    if (!name) {
      setSprintPlanError("Sprint name is required");
      return;
    }

    if (
      sprintDraft.startDate &&
      sprintDraft.endDate &&
      sprintDraft.endDate < sprintDraft.startDate
    ) {
      setSprintPlanError("End date must be on or after start date");
      return;
    }

    setSavingSprintId(sprintId);
    setSprintPlanError("");

    const result = await patchSprint(sprintId, {
      name,
      goal: sprintDraft.goal.trim() || null,
      startDate: sprintDraft.startDate || null,
      endDate: sprintDraft.endDate || null,
    });

    setSavingSprintId(null);

    if (!result.ok) {
      setSprintPlanError(result.message);
      return;
    }

    cancelEditingSprint();
  };

  const deleteSprint = async (sprintId: string) => {
    try {
      const res = await fetch(
        `/api/projects/${projectIdParam}/sprints?sprintId=${sprintId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setSprints((prev) => prev.filter((s) => s.id !== sprintId));
        // Unlink tasks from this sprint in local state
        setTasks((prev) =>
          prev.map((t) =>
            t.sprint?.id === sprintId ? { ...t, sprint: null } : t,
          ),
        );
        if (filterSprint === sprintId) setFilterSprint("ALL");
      }
    } catch {
      console.error("Failed to delete sprint");
    }
  };

  const assignTaskToSprint = async (
    taskId: string,
    sprintId: string | null,
  ) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId }),
      });
      if (res.ok) {
        const sprintInfo = sprintId
          ? sprints.find((s) => s.id === sprintId)
          : null;
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  sprint: sprintInfo
                    ? {
                        id: sprintInfo.id,
                        name: sprintInfo.name,
                        status: sprintInfo.status,
                      }
                    : null,
                }
              : t,
          ),
        );
        // Update sprint task counts
        setSprints((prev) =>
          prev.map((s) => ({
            ...s,
            _count: {
              tasks:
                s._count.tasks +
                (s.id === sprintId ? 1 : 0) -
                (tasks.find((t) => t.id === taskId)?.sprint?.id === s.id
                  ? 1
                  : 0),
            },
          })),
        );
      }
    } catch {
      console.error("Failed to assign task to sprint");
    }
  };

  if (loading) return <p>Loading project...</p>;

  // Derive unique assignees for the filter dropdown
  const assignees = Array.from(
    new Map(
      tasks.filter((t) => t.assignee).map((t) => [t.assignee!.id, t.assignee!]),
    ).values(),
  );

  // Apply filters
  const filteredTasks = tasks.filter((t) => {
    if (
      searchQuery &&
      !t.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    if (filterPriority !== "ALL" && t.priority !== filterPriority) return false;
    if (filterAssignee !== "ALL") {
      if (filterAssignee === "UNASSIGNED" && t.assignee) return false;
      if (filterAssignee !== "UNASSIGNED" && t.assignee?.id !== filterAssignee)
        return false;
    }
    if (filterSprint !== "ALL") {
      if (filterSprint === "BACKLOG" && t.sprint) return false;
      if (filterSprint !== "BACKLOG" && t.sprint?.id !== filterSprint)
        return false;
    }
    return true;
  });

  const boardColumns = {
    TODO: filteredTasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: filteredTasks.filter((t) => t.status === "IN_PROGRESS"),
  };
  const completedTasks = filteredTasks.filter((t) => t.status === "DONE");
  const hasActiveFilters =
    searchQuery !== "" ||
    filterPriority !== "ALL" ||
    filterAssignee !== "ALL" ||
    filterSprint !== "ALL";
  const activeSprint =
    sprints.find((sprint) => sprint.status === "ACTIVE") ?? null;
  const activeSprintTasks = activeSprint
    ? tasks.filter((task) => task.sprint?.id === activeSprint.id)
    : [];
  const activeSprintCompletedTasks = activeSprintTasks.filter(
    (task) => task.status === "DONE",
  ).length;
  const activeSprintInProgressTasks = activeSprintTasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const activeSprintTodoTasks = activeSprintTasks.filter(
    (task) => task.status === "TODO",
  ).length;
  const activeSprintOverdueTasks = activeSprintTasks.filter((task) => {
    if (task.status === "DONE" || !task.dueDate) {
      return false;
    }

    return new Date(task.dueDate).getTime() < Date.now();
  }).length;
  const activeSprintProgress =
    activeSprintTasks.length > 0
      ? Math.round(
          (activeSprintCompletedTasks / activeSprintTasks.length) * 100,
        )
      : 0;
  const activeSprintWindow = activeSprint
    ? formatSprintWindow(activeSprint.startDate, activeSprint.endDate)
    : null;
  const activeSprintElapsed = activeSprint
    ? getSprintElapsedPercent(activeSprint.startDate, activeSprint.endDate)
    : null;
  const activeSprintPaceLabel =
    activeSprintElapsed == null
      ? "Schedule tracking locked"
      : activeSprintProgress >= activeSprintElapsed + 10
        ? "Ahead of pace"
        : activeSprintProgress >= activeSprintElapsed - 10
          ? "On pace"
          : "Behind pace";
  const activeSprintPaceContext =
    activeSprintElapsed == null
      ? "Add sprint dates to compare elapsed time against delivered scope."
      : `${activeSprintElapsed}% of sprint time has elapsed.`;
  const activeSprintScopeSegments = [
    {
      label: "Done",
      value: activeSprintCompletedTasks,
      tone: "done",
    },
    {
      label: "In Progress",
      value: activeSprintInProgressTasks,
      tone: "progress",
    },
    {
      label: "Ready",
      value: activeSprintTodoTasks,
      tone: "ready",
    },
  ].filter((segment) => segment.value > 0);
  const latestClientInvite = clients[0]
    ? formatDisplayDate(clients[0].createdAt)
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Determine target column
    const columnStatuses = ["TODO", "IN_PROGRESS"];
    let targetStatus: string | null = null;

    if (columnStatuses.includes(overId)) {
      targetStatus = overId;
    } else {
      // Dropped over another task — find which column that task is in
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus) {
      const currentTask = tasks.find((t) => t.id === taskId);
      if (currentTask && currentTask.status !== targetStatus) {
        // Optimistic column move during drag
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: targetStatus as Task["status"] }
              : t,
          ),
        );
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    const columnStatuses = ["TODO", "IN_PROGRESS"];
    let targetStatus: string | null = null;

    if (columnStatuses.includes(overId)) {
      targetStatus = overId;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus) {
      const task = tasks.find((t) => t.id === taskId);
      // Only call API if status actually changed from original
      if (task) {
        moveTask(taskId, targetStatus as Task["status"]);
      }
    }
  };

  return (
    <div className="project-page">
      <div className="board-area">
        {/* FILTER BAR */}
        <div className="filter-bar">
          <div className="filter-bar-inputs">
            <Link
              href={`/dashboard/project/${projectIdParam}/settings`}
              className="settings-gear"
              title="Project Settings"
            >
              ⚙
            </Link>
            <input
              type="text"
              className="filter-search"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="filter-select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="ALL">All Priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select
              className="filter-select"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
            >
              <option value="ALL">All Assignees</option>
              <option value="UNASSIGNED">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email ?? "Unknown"}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={filterSprint}
              onChange={(e) => setFilterSprint(e.target.value)}
            >
              <option value="ALL">All Sprints</option>
              <option value="BACKLOG">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === "ACTIVE" ? " ●" : ""}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button
              className="filter-clear"
              onClick={() => {
                setSearchQuery("");
                setFilterPriority("ALL");
                setFilterAssignee("ALL");
                setFilterSprint("ALL");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* BOARD */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="board">
            {Object.entries(boardColumns).map(([status, items]) => (
              <DroppableColumn
                key={status}
                status={status}
                items={items}
                newTask={newTask}
                setNewTask={setNewTask}
                createTask={createTask}
                statusOrder={statusOrder}
                moveTask={moveTask}
                completeTask={completeTask}
                deleteTask={deleteTask}
                setSelectedTaskId={setSelectedTaskId}
                sprints={sprints}
                assignTaskToSprint={assignTaskToSprint}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="task-card dragging">
                <div className="task-card-top">
                  <div className="task-card-content">
                    <span
                      className={`priority-dot priority-${activeTask.priority.toLowerCase()}`}
                    />
                    <span className="task-title">{activeTask.title}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* COMPLETED TASKS LOG */}
        <div className="completed-section">
          <button
            className="completed-toggle"
            onClick={() => setShowCompleted((v) => !v)}
          >
            Completed ({completedTasks.length})
            <span className={`toggle-arrow ${showCompleted ? "open" : ""}`}>
              &#9662;
            </span>
          </button>

          {showCompleted && (
            <div className="completed-list">
              {completedTasks.length === 0 ? (
                <p className="completed-empty">No completed tasks yet.</p>
              ) : (
                completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="completed-item"
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div className="completed-item-content">
                      <span className="completed-check">&#10003;</span>
                      <span className="completed-title">{task.title}</span>
                    </div>
                    <div
                      className="completed-item-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {task.githubIssueUrl && (
                        <a
                          href={task.githubIssueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gh-issue-link"
                          title="View on GitHub"
                        >
                          GH
                        </a>
                      )}
                      <button
                        className="move-btn"
                        onClick={() => moveTask(task.id, "TODO")}
                        title="Re-open as TODO"
                      >
                        Reopen
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => deleteTask(task.id)}
                        title="Delete task"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="project-sidebar">
        {/* SPRINTS PANEL */}
        <div className="sprints-panel">
          <h5>Sprints</h5>
          {activeSprint && (
            <div className="active-sprint-overview">
              <div className="active-sprint-header">
                <span className="active-sprint-kicker">Active sprint</span>
                <span className="active-sprint-title">{activeSprint.name}</span>
              </div>
              <p className="active-sprint-goal">
                {activeSprint.goal?.trim() ||
                  "Set a sprint goal to align the team around the next milestone."}
              </p>
              <div className="active-sprint-meta">
                <span>
                  {activeSprintCompletedTasks}/{activeSprintTasks.length} tasks
                  done
                </span>
                {activeSprintWindow && <span>{activeSprintWindow}</span>}
              </div>
              <div className="active-sprint-progress">
                <div
                  className="active-sprint-progress-bar"
                  aria-label={`Active sprint progress ${activeSprintProgress}%`}
                >
                  <span
                    className="active-sprint-progress-fill"
                    style={{ width: `${activeSprintProgress}%` }}
                  />
                </div>
                <span className="active-sprint-progress-label">
                  {activeSprintProgress}% complete
                </span>
              </div>
              <div className="active-sprint-metric-grid">
                <div className="active-sprint-metric-card">
                  <span className="active-sprint-metric-label">Done</span>
                  <strong className="active-sprint-metric-value">
                    {activeSprintCompletedTasks}
                  </strong>
                </div>
                <div className="active-sprint-metric-card">
                  <span className="active-sprint-metric-label">
                    In Progress
                  </span>
                  <strong className="active-sprint-metric-value">
                    {activeSprintInProgressTasks}
                  </strong>
                </div>
                <div className="active-sprint-metric-card">
                  <span className="active-sprint-metric-label">Ready</span>
                  <strong className="active-sprint-metric-value">
                    {activeSprintTodoTasks}
                  </strong>
                </div>
                <div className="active-sprint-metric-card warning">
                  <span className="active-sprint-metric-label">Overdue</span>
                  <strong className="active-sprint-metric-value">
                    {activeSprintOverdueTasks}
                  </strong>
                </div>
              </div>
              {activeSprintTasks.length > 0 ? (
                <div className="active-sprint-burnup">
                  <div className="active-sprint-burnup-header">
                    <span>Scope burnup</span>
                    <span>{activeSprintTasks.length} scoped tasks</span>
                  </div>
                  <div className="active-sprint-burnup-bar">
                    {activeSprintScopeSegments.map((segment) => (
                      <span
                        key={segment.label}
                        className={`active-sprint-burnup-segment ${segment.tone}`}
                        style={{
                          width: `${(segment.value / activeSprintTasks.length) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="active-sprint-burnup-legend">
                    {activeSprintScopeSegments.map((segment) => (
                      <span key={segment.label}>
                        <i className={`burnup-dot ${segment.tone}`} />
                        {segment.label} {segment.value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="active-sprint-empty">
                  No tasks are scoped to this sprint yet.
                </p>
              )}
              <div
                className={`active-sprint-pace ${
                  activeSprintElapsed == null
                    ? "pending"
                    : activeSprintProgress >= activeSprintElapsed + 10
                      ? "ahead"
                      : activeSprintProgress >= activeSprintElapsed - 10
                        ? "steady"
                        : "behind"
                }`}
              >
                <span className="active-sprint-pace-label">
                  {activeSprintPaceLabel}
                </span>
                <span className="active-sprint-pace-meta">
                  {activeSprintPaceContext}
                </span>
              </div>
            </div>
          )}
          <div className="sprint-create">
            <input
              type="text"
              placeholder="New sprint name..."
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createSprint();
              }}
            />
            <button onClick={createSprint} disabled={creatingSprint}>
              +
            </button>
          </div>

          <div className="sprint-list">
            {sprints.map((sprint) => (
              <div
                key={sprint.id}
                className={`sprint-card sprint-${sprint.status.toLowerCase()}`}
              >
                <div className="sprint-card-header">
                  <span className="sprint-name">{sprint.name}</span>
                  <span
                    className={`sprint-status-badge ${sprint.status.toLowerCase()}`}
                  >
                    {sprint.status}
                  </span>
                </div>
                <div className="sprint-card-meta">
                  <span className="sprint-task-count">
                    {sprint._count.tasks} task
                    {sprint._count.tasks !== 1 ? "s" : ""}
                  </span>
                  {formatSprintWindow(sprint.startDate, sprint.endDate) && (
                    <span className="sprint-dates">
                      {formatSprintWindow(sprint.startDate, sprint.endDate)}
                    </span>
                  )}
                </div>
                {editingSprintId === sprint.id && sprintDraft ? (
                  <div className="sprint-plan-form">
                    <label className="sprint-plan-field">
                      <span>Sprint name</span>
                      <input
                        type="text"
                        value={sprintDraft.name}
                        onChange={(e) =>
                          setSprintDraft((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev,
                          )
                        }
                      />
                    </label>
                    <label className="sprint-plan-field">
                      <span>Sprint goal</span>
                      <textarea
                        value={sprintDraft.goal}
                        onChange={(e) =>
                          setSprintDraft((prev) =>
                            prev ? { ...prev, goal: e.target.value } : prev,
                          )
                        }
                        rows={3}
                        placeholder="Describe the milestone this sprint should deliver"
                      />
                    </label>
                    <div className="sprint-plan-grid">
                      <label className="sprint-plan-field">
                        <span>Start date</span>
                        <input
                          type="date"
                          value={sprintDraft.startDate}
                          onChange={(e) =>
                            setSprintDraft((prev) =>
                              prev
                                ? { ...prev, startDate: e.target.value }
                                : prev,
                            )
                          }
                        />
                      </label>
                      <label className="sprint-plan-field">
                        <span>End date</span>
                        <input
                          type="date"
                          value={sprintDraft.endDate}
                          onChange={(e) =>
                            setSprintDraft((prev) =>
                              prev
                                ? { ...prev, endDate: e.target.value }
                                : prev,
                            )
                          }
                        />
                      </label>
                    </div>
                    {sprintPlanError && (
                      <p className="sprint-plan-error">{sprintPlanError}</p>
                    )}
                    <div className="sprint-plan-actions">
                      <button
                        className="sprint-action-btn save"
                        onClick={() => saveSprintPlan(sprint.id)}
                        disabled={savingSprintId === sprint.id}
                      >
                        {savingSprintId === sprint.id
                          ? "Saving..."
                          : "Save Plan"}
                      </button>
                      <button
                        className="sprint-action-btn secondary"
                        onClick={cancelEditingSprint}
                        disabled={savingSprintId === sprint.id}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sprint-card-details">
                    <p className="sprint-card-goal">
                      {sprint.goal?.trim() || "No sprint goal defined yet."}
                    </p>
                  </div>
                )}
                <div className="sprint-card-actions">
                  <button
                    className="sprint-action-btn secondary"
                    onClick={() => startEditingSprint(sprint)}
                  >
                    {sprint.goal || sprint.startDate || sprint.endDate
                      ? "Edit Plan"
                      : "Plan Sprint"}
                  </button>
                  {sprint.status === "PLANNING" && (
                    <>
                      <button
                        className="sprint-action-btn start"
                        onClick={() =>
                          updateSprint(sprint.id, {
                            status: "ACTIVE",
                            startDate: new Date().toISOString(),
                          })
                        }
                      >
                        Start Sprint
                      </button>
                      <button
                        className="sprint-action-btn delete"
                        onClick={() => deleteSprint(sprint.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                  {sprint.status === "ACTIVE" && (
                    <button
                      className="sprint-action-btn complete"
                      onClick={() =>
                        updateSprint(sprint.id, {
                          status: "COMPLETED",
                          endDate: new Date().toISOString(),
                        })
                      }
                    >
                      Complete Sprint
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sprints.length === 0 && (
              <p className="sprint-empty">
                No sprints yet. Create one to get started.
              </p>
            )}
          </div>
        </div>

        {/* GITHUB PANEL */}
        <div className="github-panel">
          <h5>GitHub</h5>

          {!github?.repository ? (
            <div className="github-connect">
              <p className="github-empty">No repository connected</p>
              <input
                type="text"
                className="github-connect-input"
                placeholder="owner/repo or GitHub URL"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setConnectError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") connectRepo();
                }}
              />
              <button
                className="sync-btn sync-btn-primary"
                onClick={connectRepo}
                disabled={connectingRepo}
              >
                {connectingRepo ? "Connecting..." : "Connect Repo"}
              </button>
              {connectError && (
                <p className="github-connect-error">{connectError}</p>
              )}
            </div>
          ) : (
            <>
              <div className="github-repo-header">
                <div className="github-repo-copy">
                  <div className="github-repo-name">
                    {github.repository.name}
                  </div>
                  <div className="github-repo-branch">
                    Default branch: {github.repository.defaultBranch}
                  </div>
                </div>
                <span
                  className={`github-health-badge ${
                    github.repository.isArchived ? "archived" : "healthy"
                  }`}
                >
                  {github.repository.isArchived ? "Archived" : "Healthy"}
                </span>
              </div>
              <div className="github-stats">
                <span title="Stars">⭐ {github.repository.stars}</span>
                <span title="Forks">🍴 {github.repository.forks}</span>
                <span title="Open PRs">🔀 {github.openPullRequests}</span>
              </div>
              <div className="github-health-grid">
                <div className="github-health-card">
                  <span className="github-health-label">Visibility</span>
                  <strong>{formatLabel(github.repository.visibility)}</strong>
                </div>
                <div className="github-health-card">
                  <span className="github-health-label">Primary language</span>
                  <strong>
                    {github.repository.primaryLanguage ?? "Unknown"}
                  </strong>
                </div>
                <div className="github-health-card">
                  <span className="github-health-label">Last push</span>
                  <strong>
                    {formatDisplayDate(github.repository.pushedAt) ?? "Unknown"}
                  </strong>
                </div>
                <div className="github-health-card">
                  <span className="github-health-label">Repo status</span>
                  <strong>
                    {github.repository.isArchived ? "Archived" : "Active"}
                  </strong>
                </div>
              </div>

              {github.latestCommit && (
                <div className="github-commit">
                  <small>{github.latestCommit.message}</small>
                </div>
              )}

              {/* SYNC ACTIONS */}
              <div className="github-sync-section">
                <button
                  className="sync-btn sync-btn-primary"
                  onClick={syncAll}
                  disabled={syncing || syncingPRs || syncingCommits}
                >
                  {syncing || syncingPRs || syncingCommits
                    ? "Syncing..."
                    : "Sync All"}
                </button>
                <div className="sync-btn-row">
                  <button
                    className="sync-btn sync-btn-sm"
                    onClick={importGitHubIssues}
                    disabled={syncing}
                  >
                    {syncing ? "..." : "Issues"}
                  </button>
                  <button
                    className="sync-btn sync-btn-sm"
                    onClick={syncPullRequests}
                    disabled={syncingPRs}
                  >
                    {syncingPRs ? "..." : "PRs"}
                  </button>
                  <button
                    className="sync-btn sync-btn-sm"
                    onClick={syncCommits}
                    disabled={syncingCommits}
                  >
                    {syncingCommits ? "..." : "Commits"}
                  </button>
                </div>

                {syncStatus && (
                  <div className="github-sync-summary">
                    <div className="github-sync-summary-header">
                      <div>
                        <span className="github-sync-summary-label">
                          Latest sync
                        </span>
                        <strong>
                          {formatSyncAction(syncStatus.lastAction)}
                        </strong>
                      </div>
                      <span className="sync-count">
                        {syncStatus.syncedIssues} issue
                        {syncStatus.syncedIssues !== 1 ? "s" : ""} synced
                      </span>
                    </div>
                    {syncStatus.lastSyncedAt && (
                      <span className="sync-time">
                        Ran{" "}
                        {formatDisplayDate(syncStatus.lastSyncedAt, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {syncStatus.lastDetails && (
                      <div className="github-sync-summary-grid">
                        <div className="github-sync-summary-card">
                          <span>Imported</span>
                          <strong>{syncStatus.lastDetails.imported}</strong>
                        </div>
                        <div className="github-sync-summary-card">
                          <span>Updated</span>
                          <strong>{syncStatus.lastDetails.updated}</strong>
                        </div>
                        <div className="github-sync-summary-card">
                          <span>Total</span>
                          <strong>{syncStatus.lastDetails.total}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* WEBHOOK STATUS */}
              <div className="webhook-section">
                <div className="webhook-header">
                  <span className="webhook-label">Real-time Sync</span>
                  <span
                    className={`webhook-status ${webhookActive ? "active" : "inactive"}`}
                  >
                    {webhookActive ? "Active" : "Off"}
                  </span>
                </div>
                {webhookActive ? (
                  <button
                    className="sync-btn sync-btn-sm webhook-btn-remove"
                    onClick={removeWebhook}
                    disabled={settingUpWebhook}
                  >
                    {settingUpWebhook ? "..." : "Disable Webhook"}
                  </button>
                ) : (
                  <button
                    className="sync-btn sync-btn-primary webhook-btn-setup"
                    onClick={setupWebhook}
                    disabled={settingUpWebhook}
                  >
                    {settingUpWebhook ? "Setting up..." : "Enable Webhooks"}
                  </button>
                )}
                <p className="webhook-hint">
                  {webhookActive
                    ? "GitHub events sync automatically."
                    : "Enable to auto-sync issues, PRs, and commits in real-time."}
                </p>
              </div>
            </>
          )}
        </div>

        {/* CLIENTS PANEL */}
        <div className="clients-panel">
          <h5>Clients</h5>
          <div className="clients-invite">
            <input
              type="email"
              placeholder="Client email..."
              value={clientEmail}
              onChange={(e) => {
                setClientEmail(e.target.value);
                setClientError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") inviteClient();
              }}
            />
            <button onClick={inviteClient} disabled={invitingClient}>
              {invitingClient ? "..." : "Invite"}
            </button>
          </div>
          {clientError && <p className="clients-error">{clientError}</p>}
          {clients.length > 0 && (
            <div className="clients-summary">
              <span>
                {clients.length} active client stakeholder
                {clients.length !== 1 ? "s" : ""}
              </span>
              {latestClientInvite && (
                <span>Latest invite {latestClientInvite}</span>
              )}
            </div>
          )}
          <div className="clients-list">
            {clients.map((client) => {
              const invitedOn = formatDisplayDate(client.createdAt);

              return (
                <div key={client.id} className="clients-item">
                  <div className="clients-item-info">
                    {client.user.image ? (
                      <Image
                        src={client.user.image}
                        alt=""
                        width={24}
                        height={24}
                        className="clients-item-avatar"
                      />
                    ) : (
                      <span className="clients-item-avatar-fallback">
                        {client.user.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                    <div className="clients-item-copy">
                      <span className="clients-item-name">
                        {client.user.name ?? client.user.email}
                      </span>
                      {client.user.name && client.user.email && (
                        <span className="clients-item-email">
                          {client.user.email}
                        </span>
                      )}
                      <div className="clients-item-meta">
                        <span className="clients-access-badge">
                          Active access
                        </span>
                        {invitedOn && (
                          <span className="clients-invite-date">
                            Invited {invitedOn}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="clients-item-remove"
                    onClick={() => removeClient(client.id)}
                    title="Remove client"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
            {clients.length === 0 && (
              <p className="clients-empty">No clients invited yet.</p>
            )}
          </div>
        </div>

        <AiTaskDraftCard
          projectId={projectIdParam}
          boardId={boardId}
          onTaskCreated={(task) => setTasks((prev) => [...prev, task])}
        />

        <ProjectDigestCard projectId={projectIdParam} />

        {/* ACTIVITY FEED */}
        <ActivityFeed projectId={projectIdParam} />
      </div>

      {/* TASK DETAIL PANEL */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </div>
  );
}

/* ---------- Sortable task card ---------- */

function SortableTaskCard({
  task,
  statusOrder,
  moveTask,
  completeTask,
  deleteTask,
  setSelectedTaskId,
  sprints,
  assignTaskToSprint,
}: {
  task: Task;
  statusOrder: Task["status"][];
  moveTask: (id: string, status: Task["status"]) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  setSelectedTaskId: (id: string) => void;
  sprints: Sprint[];
  assignTaskToSprint: (taskId: string, sprintId: string | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const idx = statusOrder.indexOf(task.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? "dragging" : ""}`}
      onClick={() => setSelectedTaskId(task.id)}
    >
      <div className="task-card-top">
        <div className="task-card-content">
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="task-drag-handle"
            aria-label={`Drag ${task.title}`}
            title={`Drag ${task.title}`}
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
          <span
            className={`priority-dot priority-${task.priority.toLowerCase()}`}
            title={task.priority}
          />
          <span className="task-title">{task.title}</span>
        </div>
        {task.status !== "DONE" && (
          <button
            className="complete-btn"
            onClick={(e) => {
              e.stopPropagation();
              completeTask(task.id);
            }}
            title="Mark as complete"
          >
            &#10003;
          </button>
        )}
      </div>
      {task.labels?.length > 0 && (
        <div className="task-card-labels">
          {task.labels.map((l) => (
            <span
              key={l.id}
              className="task-label-chip"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      {task.dueDate && (
        <span
          className={`task-card-due ${
            new Date(task.dueDate) < new Date() && task.status !== "DONE"
              ? "overdue"
              : ""
          }`}
        >
          📅{" "}
          {new Date(task.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}
      {sprints.length > 0 && (
        <select
          className="task-sprint-select"
          value={task.sprint?.id ?? ""}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            assignTaskToSprint(task.id, e.target.value || null);
          }}
        >
          <option value="">Backlog</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <div className="task-card-bottom">
        <div className="task-card-meta">
          {task.githubIssueUrl && (
            <a
              href={task.githubIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gh-issue-link"
              title="View on GitHub"
              onClick={(e) => e.stopPropagation()}
            >
              GH
            </a>
          )}
          {task._count.comments > 0 && (
            <span
              className="comment-badge"
              title={`${task._count.comments} comment(s)`}
            >
              💬 {task._count.comments}
            </span>
          )}
          {task.assignee && (
            <span
              className="assignee-avatar"
              title={task.assignee.name ?? task.assignee.email ?? "Assigned"}
            >
              {task.assignee.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>
        <span className="task-actions" onClick={(e) => e.stopPropagation()}>
          {idx > 0 && (
            <button
              className="move-btn"
              onClick={() => moveTask(task.id, statusOrder[idx - 1])}
              title={`Move to ${statusOrder[idx - 1].replace("_", " ")}`}
            >
              &larr;
            </button>
          )}
          {idx < statusOrder.length - 1 && statusOrder[idx + 1] !== "DONE" && (
            <button
              className="move-btn"
              onClick={() => moveTask(task.id, statusOrder[idx + 1])}
              title={`Move to ${statusOrder[idx + 1].replace("_", " ")}`}
            >
              &rarr;
            </button>
          )}
          <button
            className="delete-btn"
            onClick={() => deleteTask(task.id)}
            title="Delete task"
          >
            &times;
          </button>
        </span>
      </div>
    </div>
  );
}

/* ---------- Droppable column ---------- */

function DroppableColumn({
  status,
  items,
  newTask,
  setNewTask,
  createTask,
  statusOrder,
  moveTask,
  completeTask,
  deleteTask,
  setSelectedTaskId,
  sprints,
  assignTaskToSprint,
}: {
  status: string;
  items: Task[];
  newTask: { [key: string]: string };
  setNewTask: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  createTask: (status: string) => void;
  statusOrder: Task["status"][];
  moveTask: (id: string, status: Task["status"]) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  setSelectedTaskId: (id: string) => void;
  sprints: Sprint[];
  assignTaskToSprint: (taskId: string, sprintId: string | null) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div ref={setNodeRef} className="column">
      <div className="column-header">
        <h5>{status.replace("_", " ")}</h5>
        <span className="column-count">{items.length}</span>
      </div>

      <div className="task-input">
        <input
          type="text"
          placeholder="New task..."
          value={newTask[status] || ""}
          onChange={(e) =>
            setNewTask((prev) => ({ ...prev, [status]: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") createTask(status);
          }}
        />
        <button onClick={() => createTask(status)}>+</button>
      </div>

      <SortableContext
        items={items.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((task) => (
          <SortableTaskCard
            key={task.id}
            task={task}
            statusOrder={statusOrder}
            moveTask={moveTask}
            completeTask={completeTask}
            deleteTask={deleteTask}
            setSelectedTaskId={setSelectedTaskId}
            sprints={sprints}
            assignTaskToSprint={assignTaskToSprint}
          />
        ))}
      </SortableContext>
    </div>
  );
}
