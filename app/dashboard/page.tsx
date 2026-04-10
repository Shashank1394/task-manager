"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DashboardData = {
  totalTasks: number;
  byStatus: { TODO: number; IN_PROGRESS: number; DONE: number };
  byPriority: { HIGH: number; MEDIUM: number; LOW: number };
  myActiveTasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    projectName: string;
    projectId: string;
  }[];
  recentCompleted: {
    id: string;
    title: string;
    projectName: string;
  }[];
  projectSummaries: {
    id: string;
    name: string;
    orgName: string;
    totalTasks: number;
    completedTasks: number;
    completionPct: number;
  }[];
  orgCount: number;
};

export default function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading dashboard...</p>;
  if (!data) return <p>Failed to load dashboard.</p>;

  const completionPct =
    data.totalTasks > 0
      ? Math.round((data.byStatus.DONE / data.totalTasks) * 100)
      : 0;

  return (
    <div className="dash">
      <h1 className="dash-title">Dashboard</h1>

      {/* Stats Row */}
      <div className="dash-stats">
        <div className="stat-card">
          <span className="stat-value">{data.totalTasks}</span>
          <span className="stat-label">Total Tasks</span>
        </div>
        <div className="stat-card stat-todo">
          <span className="stat-value">{data.byStatus.TODO}</span>
          <span className="stat-label">To Do</span>
        </div>
        <div className="stat-card stat-progress">
          <span className="stat-value">{data.byStatus.IN_PROGRESS}</span>
          <span className="stat-label">In Progress</span>
        </div>
        <div className="stat-card stat-done">
          <span className="stat-value">{data.byStatus.DONE}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{completionPct}%</span>
          <span className="stat-label">Completion</span>
        </div>
      </div>

      <div className="dash-grid">
        {/* My Tasks */}
        <div className="dash-card">
          <h3>My Tasks</h3>
          {data.myActiveTasks.length === 0 ? (
            <p className="dash-empty">No tasks assigned to you.</p>
          ) : (
            <div className="dash-task-list">
              {data.myActiveTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/project/${t.projectId}`}
                  className="dash-task-item"
                >
                  <span
                    className={`priority-dot priority-${t.priority.toLowerCase()}`}
                  />
                  <div className="dash-task-info">
                    <span className="dash-task-title">{t.title}</span>
                    <span className="dash-task-meta">
                      {t.projectName} ·{" "}
                      <span
                        className={`status-text status-${t.status.toLowerCase()}`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="dash-card">
          <h3>Projects</h3>
          {data.projectSummaries.length === 0 ? (
            <p className="dash-empty">No projects yet.</p>
          ) : (
            <div className="dash-project-list">
              {data.projectSummaries.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/project/${p.id}`}
                  className="dash-project-item"
                >
                  <div className="dash-project-info">
                    <span className="dash-project-name">{p.name}</span>
                    <span className="dash-project-org">{p.orgName}</span>
                  </div>
                  <div className="dash-project-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${p.completionPct}%` }}
                      />
                    </div>
                    <span className="progress-text">
                      {p.completedTasks}/{p.totalTasks}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Priority Breakdown */}
        <div className="dash-card">
          <h3>By Priority</h3>
          <div className="priority-bars">
            <div className="priority-row">
              <span className="priority-label">High</span>
              <div className="priority-bar">
                <div
                  className="priority-fill priority-high-fill"
                  style={{
                    width: `${data.totalTasks > 0 ? (data.byPriority.HIGH / data.totalTasks) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="priority-count">{data.byPriority.HIGH}</span>
            </div>
            <div className="priority-row">
              <span className="priority-label">Medium</span>
              <div className="priority-bar">
                <div
                  className="priority-fill priority-medium-fill"
                  style={{
                    width: `${data.totalTasks > 0 ? (data.byPriority.MEDIUM / data.totalTasks) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="priority-count">{data.byPriority.MEDIUM}</span>
            </div>
            <div className="priority-row">
              <span className="priority-label">Low</span>
              <div className="priority-bar">
                <div
                  className="priority-fill priority-low-fill"
                  style={{
                    width: `${data.totalTasks > 0 ? (data.byPriority.LOW / data.totalTasks) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="priority-count">{data.byPriority.LOW}</span>
            </div>
          </div>
        </div>

        {/* Recent Completed */}
        <div className="dash-card">
          <h3>Recently Completed</h3>
          {data.recentCompleted.length === 0 ? (
            <p className="dash-empty">No completed tasks yet.</p>
          ) : (
            <div className="dash-task-list">
              {data.recentCompleted.map((t) => (
                <div key={t.id} className="dash-task-item completed">
                  <span className="completed-check">&#10003;</span>
                  <div className="dash-task-info">
                    <span className="dash-task-title">{t.title}</span>
                    <span className="dash-task-meta">{t.projectName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
