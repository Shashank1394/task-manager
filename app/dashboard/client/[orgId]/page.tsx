"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ProjectSummary = {
  id: string;
  name: string;
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  completionPct: number;
};

type DashboardData = {
  organization: { id: string; name: string };
  overview: {
    totalTasks: number;
    totalDone: number;
    totalInProgress: number;
    totalTodo: number;
    overallCompletion: number;
    projectCount: number;
  };
  projects: ProjectSummary[];
};

export default function ClientDashboardPage() {
  const { orgId } = useParams();
  const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgIdStr) return;
    fetch(`/api/client/${orgIdStr}/dashboard`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Unable to load dashboard"))
      .finally(() => setLoading(false));
  }, [orgIdStr]);

  if (loading) return <p className="client-loading">Loading dashboard...</p>;
  if (error) return <p className="client-error">{error}</p>;
  if (!data) return null;

  const { organization, overview, projects } = data;

  return (
    <div className="client-dashboard">
      <div className="client-header">
        <h1>{organization.name}</h1>
        <span className="client-badge">Client View</span>
      </div>

      {/* Overview Stats */}
      <div className="client-stats">
        <div className="client-stat">
          <span className="client-stat-value">{overview.projectCount}</span>
          <span className="client-stat-label">Projects</span>
        </div>
        <div className="client-stat">
          <span className="client-stat-value">{overview.totalTasks}</span>
          <span className="client-stat-label">Total Tasks</span>
        </div>
        <div className="client-stat client-stat--done">
          <span className="client-stat-value">{overview.totalDone}</span>
          <span className="client-stat-label">Completed</span>
        </div>
        <div className="client-stat client-stat--progress">
          <span className="client-stat-value">{overview.totalInProgress}</span>
          <span className="client-stat-label">In Progress</span>
        </div>
        <div className="client-stat">
          <span className="client-stat-value">{overview.totalTodo}</span>
          <span className="client-stat-label">To Do</span>
        </div>
        <div className="client-stat client-stat--completion">
          <span className="client-stat-value">
            {overview.overallCompletion}%
          </span>
          <span className="client-stat-label">Overall Completion</span>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="client-overall-progress">
        <div className="client-overall-bar">
          <div
            className="client-overall-fill"
            style={{ width: `${overview.overallCompletion}%` }}
          />
        </div>
      </div>

      {/* Project Cards */}
      <h2 className="client-section-title">Projects</h2>
      <div className="client-projects">
        {projects.map((p) => (
          <div key={p.id} className="client-project-card">
            <div className="client-project-header">
              <h3>{p.name}</h3>
              <span className="client-project-pct">{p.completionPct}%</span>
            </div>

            <div className="client-project-bar">
              <div
                className="client-project-fill"
                style={{ width: `${p.completionPct}%` }}
              />
            </div>

            <div className="client-project-stats">
              <span className="client-project-stat">
                <span className="dot dot--todo" />
                {p.todo} To Do
              </span>
              <span className="client-project-stat">
                <span className="dot dot--progress" />
                {p.inProgress} In Progress
              </span>
              <span className="client-project-stat">
                <span className="dot dot--done" />
                {p.done} Done
              </span>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="client-empty">No projects to display yet.</p>
        )}
      </div>
    </div>
  );
}
