"use client";

import { useEffect, useState, useCallback } from "react";

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
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
  assigneeId: string | null;
  assignee: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  createdAt: string;
  comments: Comment[];
  board: { project: { organizationId: string } };
};

type Props = {
  taskId: string;
  onClose: () => void;
  onTaskUpdated: (task: {
    id: string;
    title: string;
    status: "TODO" | "IN_PROGRESS" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH";
    assignee: TaskDetail["assignee"];
    _count: { comments: number };
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

  const loadTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return;
      const data: TaskDetail = await res.json();
      setTask(data);

      // Load org members for assignee dropdown
      const orgId = data.board.project.organizationId;
      const mRes = await fetch(`/api/organizations/${orgId}/members`);
      if (mRes.ok) setMembers(await mRes.json());
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
        assignee: updated.assignee ?? task.assignee,
        _count: { comments: task.comments.length },
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
          assignee: task.assignee,
          _count: { comments: task.comments.length + 1 },
        });
      }
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

        {loading || !task ? (
          <div className="panel-body">
            <p>Loading...</p>
          </div>
        ) : (
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

            {/* Created date */}
            <div className="field-meta">
              Created {formatDate(task.createdAt)}
            </div>

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
        )}
      </div>
    </>
  );
}
