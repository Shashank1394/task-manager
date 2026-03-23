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

export default function ProjectPage() {
  const { projectId } = useParams();
  const projectIdParam = Array.isArray(projectId) ? projectId[0] : projectId;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTask, setNewTask] = useState<{ [key: string]: string }>({});
  const [boardId, setBoardId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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
    ])
      .then(([projectData, taskData, githubData]) => {
        setBoardId(projectData.board.id);
        setTasks(taskData);
        setGithub(githubData);
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

  if (loading) return <p>Loading project...</p>;

  const columns = {
    TODO: tasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS"),
    DONE: tasks.filter((t) => t.status === "DONE"),
  };

  return (
    <div className="project-page">
      {/* BOARD */}
      <div className="board">
        {Object.entries(columns).map(([status, items]) => (
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
            <h5>{status.replace("_", " ")}</h5>

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
                  <div className="task-card-content">
                    <span
                      className={`priority-dot priority-${task.priority.toLowerCase()}`}
                      title={task.priority}
                    />
                    <span className="task-title">{task.title}</span>
                  </div>
                  <div className="task-card-meta">
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
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* GITHUB PANEL */}
      <div className="github-panel">
        <h5>GitHub</h5>

        {!github?.repository ? (
          <p>No repository connected</p>
        ) : (
          <>
            <p>
              <strong>{github.repository.name}</strong>
            </p>
            <p>⭐ {github.repository.stars}</p>
            <p>🍴 {github.repository.forks}</p>
            <p>🔀 {github.openPullRequests} PRs</p>

            {github.latestCommit && (
              <div>
                <small>{github.latestCommit.message}</small>
              </div>
            )}
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
