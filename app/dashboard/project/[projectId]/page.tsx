"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TaskDetailPanel from "@/app/components/TaskDetailPanel";

type Task = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  assignee: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  _count: { comments: number };
  githubIssueUrl: string | null;
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

export default function ProjectPage() {
  const { projectId } = useParams();
  const projectIdParam = Array.isArray(projectId) ? projectId[0] : projectId;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newTask, setNewTask] = useState<{ [key: string]: string }>({});
  const [boardId, setBoardId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

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
      fetchJson<{ board: { id: string } }>(`/api/projects/${projectIdParam}`),
      fetchJson<Task[]>(`/api/projects/${projectIdParam}/tasks`),
      fetchJson<GitHubStatus>(`/api/projects/${projectIdParam}/github-status`),
      fetchJson<SyncStatus>(
        `/api/projects/${projectIdParam}/github-sync/status`,
      ),
    ])
      .then(([projectData, taskData, githubData, syncData]) => {
        setBoardId(projectData.board.id);
        setTasks(taskData);
        setGithub(githubData);
        setSyncStatus(syncData);
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

  if (loading) return <p>Loading project...</p>;

  const boardColumns = {
    TODO: tasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS"),
  };
  const completedTasks = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="project-page">
      <div className="board-area">
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
                        {idx < statusOrder.length - 1 && (
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
          <p className="github-empty">No repository connected</p>
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

            {/* IMPORT ISSUES */}
            <div className="github-sync-section">
              <button
                className="sync-btn"
                onClick={importGitHubIssues}
                disabled={syncing}
              >
                {syncing ? "Syncing..." : "Import Issues"}
              </button>

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
          </>
        )}
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
