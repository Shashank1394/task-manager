"use client";

import { useState } from "react";

type DraftResponse = {
  source: "rules" | "llm";
  generatedAt: string;
  draft: {
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
    status: "TODO" | "IN_PROGRESS" | "DONE";
    acceptanceCriteria: string[];
    reasoning: string;
  };
};

type CreatedTask = {
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

function buildTaskDescription(draft: DraftResponse["draft"]) {
  const sections = [draft.description.trim()].filter(Boolean);

  if (draft.acceptanceCriteria.length > 0) {
    sections.push(
      [
        "Acceptance criteria:",
        ...draft.acceptanceCriteria.map((item) => `- ${item}`),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceLabel(source: DraftResponse["source"]) {
  return source === "llm" ? "Ollama" : "Fallback";
}

function formatStatus(status: DraftResponse["draft"]["status"]) {
  return status.replace("_", " ");
}

export default function AiTaskDraftCard({
  projectId,
  boardId,
  onTaskCreated,
}: {
  projectId: string;
  boardId: string | null;
  onTaskCreated?: (task: CreatedTask) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const generateDraft = async () => {
    if (rawText.trim().length < 12) {
      setError("Paste a little more context before generating a draft.");
      setDraft(null);
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-task-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setError(payload?.error || "Unable to generate AI task draft");
        setDraft(null);
        return;
      }

      setDraft(payload as DraftResponse);
    } catch {
      setError("Unable to generate AI task draft");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  const createTaskFromDraft = async () => {
    if (!boardId || !draft) {
      return;
    }

    setCreating(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.draft.title,
          description: buildTaskDescription(draft.draft),
          priority: draft.draft.priority,
          status: draft.draft.status,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setError(payload?.error || "Unable to create task from AI draft");
        return;
      }

      onTaskCreated?.(payload as CreatedTask);
      setRawText("");
      setDraft(null);
      setSuccessMessage(
        `Created \"${(payload as CreatedTask).title}\" in ${formatStatus((payload as CreatedTask).status)}.`,
      );
    } catch {
      setError("Unable to create task from AI draft");
    } finally {
      setCreating(false);
    }
  };

  const generatedAt = draft ? formatGeneratedAt(draft.generatedAt) : null;

  return (
    <section className="ai-task-draft-panel">
      <div className="ai-task-draft-header">
        <div>
          <h5>AI Task Draft</h5>
          <p className="ai-task-draft-kicker">
            Paste rough notes and turn them into a ready-to-create task.
          </p>
        </div>
        <button
          className="ai-task-draft-action"
          onClick={generateDraft}
          disabled={loading}
        >
          {loading ? "Generating..." : draft ? "Regenerate" : "Generate draft"}
        </button>
      </div>

      <textarea
        className="ai-task-draft-input"
        placeholder="Paste a meeting note, client request, or rough feature idea..."
        value={rawText}
        onChange={(event) => {
          setRawText(event.target.value);
          if (error) {
            setError("");
          }
        }}
        rows={5}
      />

      {!draft && !error && !successMessage && (
        <p className="ai-task-draft-empty">
          Example: “Prepare the investor demo flow this week. Include signup,
          board drag-and-drop, and the AI brief in the walkthrough.”
        </p>
      )}

      {error && <p className="ai-task-draft-error">{error}</p>}
      {successMessage && (
        <p className="ai-task-draft-success">{successMessage}</p>
      )}

      {draft && (
        <div className="ai-task-draft-body">
          <div className="ai-task-draft-title-row">
            <strong className="ai-task-draft-title">{draft.draft.title}</strong>
            <span
              className={`ai-task-draft-source-badge ${draft.source === "llm" ? "ollama" : "fallback"}`}
            >
              {getSourceLabel(draft.source)}
            </span>
          </div>

          <div className="ai-task-draft-tags">
            <span
              className={`ai-task-draft-tag priority-${draft.draft.priority.toLowerCase()}`}
            >
              {draft.draft.priority} priority
            </span>
            <span className="ai-task-draft-tag tone-status">
              {formatStatus(draft.draft.status)}
            </span>
          </div>

          <p className="ai-task-draft-description">{draft.draft.description}</p>

          <div className="ai-task-draft-section">
            <span className="ai-task-draft-label">Acceptance criteria</span>
            <ul>
              {draft.draft.acceptanceCriteria.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="ai-task-draft-reasoning">{draft.draft.reasoning}</p>

          <div className="ai-task-draft-footer">
            <p className="ai-task-draft-meta">
              {generatedAt ? `Generated ${generatedAt}` : "Generated just now"}
            </p>
            <button
              className="ai-task-draft-create"
              onClick={createTaskFromDraft}
              disabled={creating || !boardId}
            >
              {creating ? "Creating..." : "Create task from draft"}
            </button>
          </div>

          {!boardId && (
            <p className="ai-task-draft-empty">
              The board is still loading before task creation is enabled.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
