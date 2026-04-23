"use client";

import { useState } from "react";

type ProjectDigest = {
  source: "rules" | "llm";
  generatedAt: string;
  summary: string;
  highlights: string[];
  risks: string[];
  nextSteps: string[];
  etaReport: {
    projectedCompletionDate: string | null;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    summary: string;
    assumptions: string[];
  };
  snapshot: {
    totalTasks: number;
    doneTasks: number;
    inProgressTasks: number;
    todoTasks: number;
    overdueTasks: number;
    unassignedOpenTasks: number;
    clientCount: number;
    activeSprintName: string | null;
  };
};

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

function formatEtaDate(value: string | null) {
  if (!value) {
    return "Forecast needs more signal";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Forecast needs more signal";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDigestSourceLabel(source: ProjectDigest["source"]) {
  return source === "llm" ? "Ollama" : "Fallback";
}

function getEtaConfidenceLabel(
  confidence: ProjectDigest["etaReport"]["confidence"],
) {
  return `${confidence.toLowerCase()} confidence`;
}

export default function ProjectDigestCard({
  projectId,
}: {
  projectId: string;
}) {
  const [digest, setDigest] = useState<ProjectDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDigest = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-digest`);
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setError(payload?.error || "Unable to generate project brief");
        setDigest(null);
        return;
      }

      setDigest(payload as ProjectDigest);
    } catch {
      setError("Unable to generate project brief");
      setDigest(null);
    } finally {
      setLoading(false);
    }
  };

  const generatedAt = digest ? formatGeneratedAt(digest.generatedAt) : null;

  return (
    <div className="project-digest-panel">
      <div className="project-digest-header">
        <div>
          <div className="project-digest-title-row">
            <h5>AI Brief</h5>
            {digest && (
              <span
                className={`project-digest-source-badge ${digest.source === "llm" ? "ollama" : "fallback"}`}
              >
                {getDigestSourceLabel(digest.source)}
              </span>
            )}
          </div>
          <p className="project-digest-kicker">
            One-click summary from current project signals.
          </p>
        </div>
        <button
          className="project-digest-action"
          onClick={loadDigest}
          disabled={loading}
        >
          {loading
            ? "Generating..."
            : digest
              ? "Refresh brief"
              : "Generate AI brief"}
        </button>
      </div>

      {error && <p className="project-digest-error">{error}</p>}

      {!digest && !error && (
        <p className="project-digest-empty">
          Generate a quick read on progress, delivery risks, and recommended
          next moves.
        </p>
      )}

      {digest && (
        <div className="project-digest-body">
          <div className="project-digest-stats">
            <span>
              {digest.snapshot.doneTasks}/{digest.snapshot.totalTasks} done
            </span>
            <span>{digest.snapshot.inProgressTasks} in progress</span>
            <span>{digest.snapshot.overdueTasks} overdue</span>
          </div>

          <p className="project-digest-summary">{digest.summary}</p>

          <div className="project-digest-eta-card">
            <div className="project-digest-eta-header">
              <span className="project-digest-label">Completion ETA</span>
              <span
                className={`project-digest-eta-confidence ${digest.etaReport.confidence.toLowerCase()}`}
              >
                {getEtaConfidenceLabel(digest.etaReport.confidence)}
              </span>
            </div>
            <strong className="project-digest-eta-date">
              {formatEtaDate(digest.etaReport.projectedCompletionDate)}
            </strong>
            <p className="project-digest-eta-summary">
              {digest.etaReport.summary}
            </p>
            <ul className="project-digest-eta-assumptions">
              {digest.etaReport.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="project-digest-section">
            <span className="project-digest-label">Highlights</span>
            <ul>
              {digest.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="project-digest-section tone-risk">
            <span className="project-digest-label">Risks</span>
            <ul>
              {digest.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="project-digest-section tone-action">
            <span className="project-digest-label">Next steps</span>
            <ul>
              {digest.nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="project-digest-meta">
            {generatedAt ? `Generated ${generatedAt}` : "Generated just now"}
            {digest.source === "llm"
              ? " with local Ollama phrasing."
              : " using current board signals."}
          </p>
        </div>
      )}
    </div>
  );
}
