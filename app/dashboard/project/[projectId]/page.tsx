"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import TaskDetailPanel from "@/app/components/TaskDetailPanel";

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
};

type GitHubStatus = {
  repository: {
    name: string;
    stars: number;
    forks: number;
    defaultBranch: string;
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
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
    ])
      .then(([projectData, taskData, githubData, syncData, clientData]) => {
        setBoardId(projectData.board.id);
        setWebhookActive(projectData.webhookActive);
        setTasks(taskData);
        setGithub(githubData);
        setSyncStatus(syncData);
        setClients(clientData);
      })
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
    return true;
  });

  const boardColumns = {
    TODO: filteredTasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: filteredTasks.filter((t) => t.status === "IN_PROGRESS"),
  };
  const completedTasks = filteredTasks.filter((t) => t.status === "DONE");
  const hasActiveFilters =
    searchQuery !== "" || filterPriority !== "ALL" || filterAssignee !== "ALL";

  return (
    <div className="project-page">
      <div className="board-area">
        {/* FILTER BAR */}
        <div className="filter-bar">
          <div className="filter-bar-inputs">
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
          </div>
          {hasActiveFilters && (
            <button
              className="filter-clear"
              onClick={() => {
                setSearchQuery("");
                setFilterPriority("ALL");
                setFilterAssignee("ALL");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* BOARD */}
        <div className="board">
          {Object.entries(boardColumns).map(([status, items]) => (
            <div
              key={status}
              className={`column ${draggingId ? "drop-target" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("drag-over");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("drag-over");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("drag-over");
                if (draggingId) {
                  moveTask(draggingId, status as Task["status"]);
                  setDraggingId(null);
                }
              }}
            >
              <div className="column-header">
                <h5>{status.replace("_", " ")}</h5>
                <span className="column-count">{items.length}</span>
              </div>

              {/* CREATE TASK INPUT */}
              <div className="task-input">
                <input
                  type="text"
                  placeholder="New task..."
                  value={newTask[status] || ""}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      [status]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createTask(status);
                  }}
                />

                <button onClick={() => createTask(status)}>+</button>
              </div>

              {/* TASKS */}
              {items.map((task) => {
                const idx = statusOrder.indexOf(task.status);
                return (
                  <div
                    key={task.id}
                    className={`task-card ${draggingId === task.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(task.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div className="task-card-top">
                      <div className="task-card-content">
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
                    {task.labels.length > 0 && (
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
                          new Date(task.dueDate) < new Date() &&
                          task.status !== "DONE"
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
                            title={
                              task.assignee.name ??
                              task.assignee.email ??
                              "Assigned"
                            }
                          >
                            {task.assignee.name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                        )}
                      </div>
                      <span
                        className="task-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {idx > 0 && (
                          <button
                            className="move-btn"
                            onClick={() =>
                              moveTask(task.id, statusOrder[idx - 1])
                            }
                            title={`Move to ${statusOrder[idx - 1].replace("_", " ")}`}
                          >
                            &larr;
                          </button>
                        )}
                        {idx < statusOrder.length - 1 &&
                          statusOrder[idx + 1] !== "DONE" && (
                            <button
                              className="move-btn"
                              onClick={() =>
                                moveTask(task.id, statusOrder[idx + 1])
                              }
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
              })}
            </div>
          ))}
        </div>

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
            <div className="github-repo-name">{github.repository.name}</div>
            <div className="github-stats">
              <span title="Stars">⭐ {github.repository.stars}</span>
              <span title="Forks">🍴 {github.repository.forks}</span>
              <span title="Open PRs">🔀 {github.openPullRequests}</span>
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

              {syncStatus && syncStatus.syncedIssues > 0 && (
                <div className="sync-status">
                  <span className="sync-count">
                    {syncStatus.syncedIssues} issue
                    {syncStatus.syncedIssues !== 1 ? "s" : ""} synced
                  </span>
                  {syncStatus.lastSyncedAt && (
                    <span className="sync-time">
                      Last sync:{" "}
                      {new Date(syncStatus.lastSyncedAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
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
        <div className="clients-list">
          {clients.map((c) => (
            <div key={c.id} className="clients-item">
              <div className="clients-item-info">
                {c.user.image ? (
                  <Image
                    src={c.user.image}
                    alt=""
                    width={24}
                    height={24}
                    className="clients-item-avatar"
                  />
                ) : (
                  <span className="clients-item-avatar-fallback">
                    {c.user.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <span className="clients-item-name">
                  {c.user.name ?? c.user.email}
                </span>
              </div>
              <button
                className="clients-item-remove"
                onClick={() => removeClient(c.id)}
                title="Remove client"
              >
                &times;
              </button>
            </div>
          ))}
          {clients.length === 0 && (
            <p className="clients-empty">No clients invited yet.</p>
          )}
        </div>
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
