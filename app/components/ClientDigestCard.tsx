"use client";

import { useState } from "react";

type ClientDigest = {
  source: "rules" | "llm";
  generatedAt: string;
  summary: string;
  highlights: string[];
  risks: string[];
  nextSteps: string[];
  snapshot: {
    projectCount: number;
    totalTasks: number;
    totalDone: number;
    totalInProgress: number;
    totalTodo: number;
    overallCompletion: number;
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

function getDigestSourceLabel(source: ClientDigest["source"]) {
  return source === "llm" ? "Ollama" : "Fallback";
}

export default function ClientDigestCard({ orgId }: { orgId: string }) {
  const [digest, setDigest] = useState<ClientDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDigest = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/client/${orgId}/ai-digest`);
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setError(payload?.error || "Unable to generate client brief");
        setDigest(null);
        return;
      }

      setDigest(payload as ClientDigest);
    } catch {
      setError("Unable to generate client brief");
      setDigest(null);
    } finally {
      setLoading(false);
    }
  };

  const generatedAt = digest ? formatGeneratedAt(digest.generatedAt) : null;

  return (
    <section className="client-digest-card">
      <div className="client-digest-header">
        <div>
          <div className="client-digest-title-row">
            <h2 className="client-section-title">AI Client Brief</h2>
            {digest && (
              <span
                className={`client-digest-source-badge ${digest.source === "llm" ? "ollama" : "fallback"}`}
              >
                {getDigestSourceLabel(digest.source)}
              </span>
            )}
          </div>
          <p className="client-digest-description">
            Generate a client-safe progress summary from the delivery signals
            you can already see.
          </p>
        </div>
        <button
          className="client-digest-action"
          onClick={loadDigest}
          disabled={loading}
        >
          {loading
            ? "Generating..."
            : digest
              ? "Refresh brief"
              : "Generate brief"}
        </button>
      </div>

      {error && <p className="client-error">{error}</p>}

      {!digest && !error && (
        <p className="client-digest-empty">
          Use this to turn the current dashboard snapshot into a short update
          you can quickly share.
        </p>
      )}

      {digest && (
        <div className="client-digest-body">
          <div className="client-digest-stats">
            <span>{digest.snapshot.projectCount} projects</span>
            <span>{digest.snapshot.overallCompletion}% complete</span>
            <span>{digest.snapshot.totalInProgress} in progress</span>
          </div>

          <p className="client-digest-summary">{digest.summary}</p>

          <div className="client-digest-section">
            <span className="client-digest-label">Highlights</span>
            <ul>
              {digest.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="client-digest-section tone-risk">
            <span className="client-digest-label">Watchouts</span>
            <ul>
              {digest.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="client-digest-section tone-action">
            <span className="client-digest-label">
              Best next talking points
            </span>
            <ul>
              {digest.nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="client-digest-meta">
            {generatedAt ? `Generated ${generatedAt}` : "Generated just now"}
            {digest.source === "llm"
              ? " with local Ollama phrasing."
              : " from the current client dashboard snapshot."}
          </p>
        </div>
      )}
    </section>
  );
}
