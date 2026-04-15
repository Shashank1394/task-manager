"use client";

import { useEffect, useState, useCallback } from "react";

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
};

type LabelData = {
  id: string;
  name: string;
  color: string;
};

type SubtaskData = {
  id: string;
  title: string;
  done: boolean;
};

type OrgMember = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  assigneeId: string | null;
  assignee: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  createdAt: string;
  comments: Comment[];
  labels: LabelData[];
  subtasks: SubtaskData[];
  board: { project: { organizationId: string } };
  githubIssueUrl: string | null;
};

type GitHubTaskData = {
  issue: {
    number: number;
    url: string | null;
    syncDirection: string;
    lastSyncedAt: string;
  } | null;
  pullRequests: {
    id: string;
    githubPrNumber: number;
    title: string;
    state: string;
    url: string;
    authorLogin: string | null;
    createdAt: string;
  }[];
  commits: {
    id: string;
    sha: string;
    message: string;
    authorName: string | null;
    authorDate: string | null;
    url: string;
  }[];
};

type Props = {
  taskId: string;
  onClose: () => void;
  onTaskUpdated: (task: {
    id: string;
    title: string;
    status: "TODO" | "IN_PROGRESS" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH";
    dueDate: string | null;
    assignee: TaskDetail["assignee"];
    _count: { comments: number };
    githubIssueUrl: string | null;
    labels: { id: string; name: string; color: string }[];
    sprint: { id: string; name: string; status: string } | null;
  }) => void;
};

export default function TaskDetailPanel({
  taskId,
  onClose,
  onTaskUpdated,
}: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [saving, setSaving] = useState(false);
  const [ghData, setGhData] = useState<GitHubTaskData | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "github">("details");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [branchUrl, setBranchUrl] = useState<string | null>(null);

  // Labels
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  // Subtasks
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const loadTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return;
      const data: TaskDetail = await res.json();
      setTask(data);

      // Load org members for assignee dropdown
      const orgId = data.board.project.organizationId;
      const [mRes, ghRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/members`),
        fetch(`/api/tasks/${taskId}/github`),
      ]);
      if (mRes.ok) setMembers(await mRes.json());
      if (ghRes.ok) setGhData(await ghRes.json());
    } catch (e) {
      console.error("Failed to load task:", e);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const updateField = async (field: string, value: string | null) => {
    if (!task) return;
    setSaving(true);

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });

    if (res.ok) {
      const updated = await res.json();
      setTask((prev) => (prev ? { ...prev, ...updated } : prev));
      onTaskUpdated({
        id: task.id,
        title: field === "title" ? (value as string) : task.title,
        status:
          field === "status" ? (value as TaskDetail["status"]) : task.status,
        priority:
          field === "priority"
            ? (value as TaskDetail["priority"])
            : task.priority,
        dueDate:
          field === "dueDate"
            ? (value as string | null)
            : (task.dueDate ?? null),
        assignee: updated.assignee ?? task.assignee,
        _count: { comments: task.comments.length },
        githubIssueUrl: task.githubIssueUrl,
        labels: task.labels ?? [],
        sprint:
          ((task as Record<string, unknown>).sprint as {
            id: string;
            name: string;
            status: string;
          } | null) ?? null,
      });
    }
    setSaving(false);
  };

  const addComment = async () => {
    if (!commentText.trim()) return;

    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: commentText }),
    });

    if (res.ok) {
      const comment: Comment = await res.json();
      setTask((prev) =>
        prev ? { ...prev, comments: [...prev.comments, comment] } : prev,
      );
      setCommentText("");
      if (task) {
        onTaskUpdated({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ?? null,
          assignee: task.assignee,
          _count: { comments: task.comments.length + 1 },
          githubIssueUrl: task.githubIssueUrl,
          labels: task.labels ?? [],
          sprint:
            ((task as Record<string, unknown>).sprint as {
              id: string;
              name: string;
              status: string;
            } | null) ?? null,
        });
      }
    }
  };

  const addLabel = async () => {
    if (!newLabelName.trim()) return;
    const res = await fetch(`/api/tasks/${taskId}/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
    });
    if (res.ok) {
      const label: LabelData = await res.json();
      setTask((prev) =>
        prev ? { ...prev, labels: [...prev.labels, label] } : prev,
      );
      setNewLabelName("");
    }
  };

  const removeLabel = async (labelId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/labels`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labelId }),
    });
    if (res.ok) {
      setTask((prev) =>
        prev
          ? { ...prev, labels: prev.labels.filter((l) => l.id !== labelId) }
          : prev,
      );
    }
  };

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtaskTitle.trim() }),
    });
    if (res.ok) {
      const subtask: SubtaskData = await res.json();
      setTask((prev) =>
        prev ? { ...prev, subtasks: [...prev.subtasks, subtask] } : prev,
      );
      setNewSubtaskTitle("");
    }
  };

  const toggleSubtask = async (subtaskId: string, done: boolean) => {
    setTask((prev) =>
      prev
        ? {
            ...prev,
            subtasks: prev.subtasks.map((s) =>
              s.id === subtaskId ? { ...s, done } : s,
            ),
          }
        : prev,
    );
    await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtaskId, done }),
    });
  };

  const removeSubtask = async (subtaskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtaskId }),
    });
    if (res.ok) {
      setTask((prev) =>
        prev
          ? {
              ...prev,
              subtasks: prev.subtasks.filter((s) => s.id !== subtaskId),
            }
          : prev,
      );
    }
  };

  const createBranch = async () => {
    if (creatingBranch) return;
    setCreatingBranch(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/github/create-branch`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setBranchUrl(`https://github.com/${data.branchName ? "" : ""}`);
          alert("Branch already exists!");
        } else {
          console.error("Create branch failed:", data.error);
        }
        return;
      }
      setBranchUrl(data.url);
    } catch (error) {
      console.error("Create branch failed:", error);
    } finally {
      setCreatingBranch(false);
    }
  };

  const createIssue = async () => {
    if (creatingIssue) return;
    setCreatingIssue(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/github/create-issue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          alert("Task already has a linked GitHub issue.");
        } else {
          console.error("Create issue failed:", data.error);
        }
        return;
      }
      // Refresh GitHub data
      const ghRes = await fetch(`/api/tasks/${taskId}/github`);
      if (ghRes.ok) setGhData(await ghRes.json());
    } catch (error) {
      console.error("Create issue failed:", error);
    } finally {
      setCreatingIssue(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="panel-backdrop" onClick={onClose} />

      {/* Slide-out Panel */}
      <div className="task-detail-panel">
        {/* Header */}
        <div className="panel-header">
          <h4>Task Details</h4>
          <button className="panel-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="panel-tabs">
          <button
            className={`panel-tab ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            className={`panel-tab ${activeTab === "github" ? "active" : ""}`}
            onClick={() => setActiveTab("github")}
          >
            GitHub
            {ghData &&
              (ghData.pullRequests.length > 0 ||
                ghData.commits.length > 0 ||
                ghData.issue) && (
                <span className="tab-badge">
                  {ghData.pullRequests.length +
                    ghData.commits.length +
                    (ghData.issue ? 1 : 0)}
                </span>
              )}
          </button>
        </div>

        {loading || !task ? (
          <div className="panel-body">
            <p>Loading...</p>
          </div>
        ) : activeTab === "details" ? (
          <div className="panel-body">
            {/* Title */}
            <div className="field-group">
              <label>Title</label>
              <input
                type="text"
                className="field-input"
                value={task.title}
                onChange={(e) =>
                  setTask((prev) =>
                    prev ? { ...prev, title: e.target.value } : prev,
                  )
                }
                onBlur={(e) => updateField("title", e.target.value)}
              />
            </div>

            {/* Status + Priority row */}
            <div className="field-row">
              <div className="field-group">
                <label>Status</label>
                <select
                  className="field-input"
                  value={task.status}
                  onChange={(e) => updateField("status", e.target.value)}
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>

              <div className="field-group">
                <label>Priority</label>
                <select
                  className="field-input"
                  value={task.priority}
                  onChange={(e) => updateField("priority", e.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
            </div>

            {/* Assignee */}
            <div className="field-group">
              <label>Assignee</label>
              <select
                className="field-input"
                value={task.assigneeId ?? ""}
                onChange={(e) =>
                  updateField("assigneeId", e.target.value || null)
                }
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name || m.user.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="field-group">
              <label>Due Date</label>
              <input
                type="date"
                className="field-input"
                value={
                  task.dueDate
                    ? new Date(task.dueDate).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => updateField("dueDate", e.target.value || null)}
              />
              {task.dueDate && (
                <span
                  className={`due-date-badge ${
                    new Date(task.dueDate) < new Date() &&
                    task.status !== "DONE"
                      ? "overdue"
                      : ""
                  }`}
                >
                  {new Date(task.dueDate) < new Date() && task.status !== "DONE"
                    ? "Overdue"
                    : `Due ${formatDate(task.dueDate)}`}
                </span>
              )}
            </div>

            {/* Labels */}
            <div className="field-group">
              <label>Labels</label>
              <div className="labels-list">
                {task.labels.map((l) => (
                  <span
                    key={l.id}
                    className="label-chip"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                    <button
                      className="label-remove"
                      onClick={() => removeLabel(l.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="label-add">
                <input
                  type="text"
                  className="field-input label-input"
                  placeholder="New label..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addLabel();
                  }}
                />
                <input
                  type="color"
                  className="label-color-picker"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                />
                <button
                  className="label-add-btn"
                  onClick={addLabel}
                  disabled={!newLabelName.trim()}
                >
                  +
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="field-group">
              <label>Description</label>
              <textarea
                className="field-input field-textarea"
                rows={4}
                placeholder="Add a description..."
                value={task.description ?? ""}
                onChange={(e) =>
                  setTask((prev) =>
                    prev ? { ...prev, description: e.target.value } : prev,
                  )
                }
                onBlur={(e) => updateField("description", e.target.value)}
              />
            </div>

            {/* Subtasks */}
            <div className="field-group">
              <label>
                Subtasks
                {task.subtasks.length > 0 && (
                  <span className="subtask-progress">
                    {" "}
                    ({task.subtasks.filter((s) => s.done).length}/
                    {task.subtasks.length})
                  </span>
                )}
              </label>
              {task.subtasks.length > 0 && (
                <div className="subtask-bar">
                  <div
                    className="subtask-bar-fill"
                    style={{
                      width: `${
                        (task.subtasks.filter((s) => s.done).length /
                          task.subtasks.length) *
                        100
                      }%`,
                    }}
                  />
                </div>
              )}
              <div className="subtask-list">
                {task.subtasks.map((s) => (
                  <div key={s.id} className="subtask-item">
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={(e) => toggleSubtask(s.id, e.target.checked)}
                    />
                    <span
                      className={`subtask-title ${s.done ? "subtask-done" : ""}`}
                    >
                      {s.title}
                    </span>
                    <button
                      className="subtask-remove"
                      onClick={() => removeSubtask(s.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="subtask-add">
                <input
                  type="text"
                  className="field-input"
                  placeholder="Add subtask..."
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSubtask();
                  }}
                />
                <button
                  className="subtask-add-btn"
                  onClick={addSubtask}
                  disabled={!newSubtaskTitle.trim()}
                >
                  +
                </button>
              </div>
            </div>

            {/* Created date */}
            <div className="field-meta">
              Created {formatDate(task.createdAt)}
            </div>

            {/* GitHub Issue Link */}
            {task.githubIssueUrl && (
              <div className="field-group">
                <label>GitHub Issue</label>
                <a
                  href={task.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gh-issue-panel-link"
                >
                  {task.githubIssueUrl.replace("https://github.com/", "")}
                </a>
              </div>
            )}

            {saving && <div className="field-meta">Saving...</div>}

            {/* Comments */}
            <div className="comments-section">
              <h5>Comments ({task.comments.length})</h5>

              <div className="comments-list">
                {task.comments.map((c) => (
                  <div key={c.id} className="comment">
                    <div className="comment-header">
                      <span className="comment-avatar">
                        {c.user.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                      <strong>{c.user.name ?? "Unknown"}</strong>
                      <span className="comment-date">
                        {formatDate(c.createdAt)}
                      </span>
                    </div>
                    <p className="comment-body">{c.content}</p>
                  </div>
                ))}
              </div>

              <div className="comment-form">
                <textarea
                  rows={2}
                  className="field-input"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      addComment();
                    }
                  }}
                />
                <button
                  className="comment-submit"
                  onClick={addComment}
                  disabled={!commentText.trim()}
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel-body">
            {/* GitHub Actions */}
            <div className="gh-actions">
              {!ghData?.issue && (
                <button
                  className="gh-action-btn"
                  onClick={createIssue}
                  disabled={creatingIssue}
                >
                  {creatingIssue ? "Creating..." : "Create GitHub Issue"}
                </button>
              )}
              <button
                className="gh-action-btn gh-action-secondary"
                onClick={createBranch}
                disabled={creatingBranch}
              >
                {creatingBranch ? "Creating..." : "Create Branch"}
              </button>
              {branchUrl && (
                <a
                  href={branchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gh-branch-link"
                >
                  View Branch →
                </a>
              )}
            </div>

            {/* GitHub Issue */}
            {ghData?.issue && (
              <div className="gh-section">
                <h5>Linked Issue</h5>
                <a
                  href={ghData.issue.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gh-item"
                >
                  <span className="gh-item-icon gh-issue-icon">●</span>
                  <span className="gh-item-text">#{ghData.issue.number}</span>
                </a>
              </div>
            )}

            {/* Pull Requests */}
            <div className="gh-section">
              <h5>Pull Requests ({ghData?.pullRequests.length ?? 0})</h5>
              {ghData?.pullRequests.length === 0 ? (
                <p className="gh-empty">No linked pull requests</p>
              ) : (
                <div className="gh-list">
                  {ghData?.pullRequests.map((pr) => (
                    <a
                      key={pr.id}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gh-item"
                    >
                      <span
                        className={`gh-item-icon gh-pr-${pr.state}`}
                        title={pr.state}
                      >
                        {pr.state === "merged"
                          ? "⏣"
                          : pr.state === "open"
                            ? "◎"
                            : "○"}
                      </span>
                      <span className="gh-item-text">
                        <span className="gh-item-title">
                          #{pr.githubPrNumber} {pr.title}
                        </span>
                        <span className="gh-item-meta">
                          {pr.authorLogin && `by ${pr.authorLogin} · `}
                          {pr.state}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Commits */}
            <div className="gh-section">
              <h5>Commits ({ghData?.commits.length ?? 0})</h5>
              {ghData?.commits.length === 0 ? (
                <p className="gh-empty">No linked commits</p>
              ) : (
                <div className="gh-list">
                  {ghData?.commits.map((c) => (
                    <a
                      key={c.id}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gh-item"
                    >
                      <code className="gh-sha">{c.sha.slice(0, 7)}</code>
                      <span className="gh-item-text">
                        <span className="gh-item-title">
                          {c.message.split("\n")[0]}
                        </span>
                        <span className="gh-item-meta">
                          {c.authorName && `${c.authorName}`}
                          {c.authorDate && ` · ${formatDate(c.authorDate)}`}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {!ghData?.issue &&
              ghData?.pullRequests.length === 0 &&
              ghData?.commits.length === 0 && (
                <div className="gh-empty-state">
                  <p>No GitHub data linked to this task.</p>
                  <p className="gh-empty-hint">
                    Use <code>TASK-{task.id}</code> in PR titles, branch names,
                    or commit messages to auto-link.
                  </p>
                </div>
              )}
          </div>
        )}
      </div>
    </>
  );
}
