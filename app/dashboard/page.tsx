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
    estimatedHours: number | null;
    loggedHours: number;
    dueDate: string | null;
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
    estimatedHours: number;
    loggedHours: number;
  }[];
  overdueTasks: {
    id: string;
    title: string;
    dueDate: string;
    status: string;
    priority: string;
    projectName: string;
    projectId: string;
  }[];
  dueSoonTasks: {
    id: string;
    title: string;
    dueDate: string;
    status: string;
    priority: string;
    projectName: string;
    projectId: string;
  }[];
  activeSprints: {
    id: string;
    name: string;
    endDate: string | null;
    projectName: string;
    projectId: string;
    totalTasks: number;
    completedTasks: number;
  }[];
  orgCount: number;
  timeTracking: {
    totalEstimated: number;
    totalLogged: number;
  };
};

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `${diffDays}d left`;
}

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

  if (loading) return <p className="dash-loading">Loading dashboard...</p>;
  if (!data) return <p>Failed to load dashboard.</p>;

  const byStatus = data.byStatus ?? { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  const byPriority = data.byPriority ?? { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const totalTasks = data.totalTasks ?? 0;
  const myActiveTasks = data.myActiveTasks ?? [];
  const recentCompleted = data.recentCompleted ?? [];
  const projectSummaries = data.projectSummaries ?? [];
  const overdueTasks = data.overdueTasks ?? [];
  const dueSoonTasks = data.dueSoonTasks ?? [];
  const activeSprints = data.activeSprints ?? [];
  const tt = data.timeTracking ?? { totalEstimated: 0, totalLogged: 0 };

  const completionPct =
    totalTasks > 0 ? Math.round((byStatus.DONE / totalTasks) * 100) : 0;

  const timeUtilization =
    tt.totalEstimated > 0
      ? Math.round((tt.totalLogged / tt.totalEstimated) * 100)
      : 0;

  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? "Good morning"
      : today.getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  const dateString = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="dash">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">{greeting}</h1>
          <p className="dash-date">{dateString}</p>
        </div>
        {overdueTasks.length > 0 && (
          <div className="dash-alert">
            <span className="dash-alert-icon">!</span>
            {overdueTasks.length} overdue task{overdueTasks.length > 1 && "s"}
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="dash-stats">
        <div className="stat-card">
          <span className="stat-value">{totalTasks}</span>
          <span className="stat-label">Total Tasks</span>
        </div>
        <div className="stat-card stat-todo">
          <span className="stat-value">{byStatus.TODO}</span>
          <span className="stat-label">To Do</span>
        </div>
        <div className="stat-card stat-progress">
          <span className="stat-value">{byStatus.IN_PROGRESS}</span>
          <span className="stat-label">In Progress</span>
        </div>
        <div className="stat-card stat-done">
          <span className="stat-value">{byStatus.DONE}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat-card">
          <div className="stat-completion-ring">
            <svg viewBox="0 0 36 36" className="completion-svg">
              <path
                className="ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="ring-fill"
                strokeDasharray={`${completionPct}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <text x="18" y="20.5" className="ring-text">
                {completionPct}%
              </text>
            </svg>
          </div>
          <span className="stat-label">Completion</span>
        </div>
        <div className="stat-card stat-time">
          <span className="stat-value">{tt.totalLogged}h</span>
          <span className="stat-label">Hours Logged</span>
        </div>
      </div>

      {/* Active Sprints */}
      {activeSprints.length > 0 && (
        <div className="dash-card dash-card-full">
          <h3>Active Sprints</h3>
          <div className="sprint-cards">
            {activeSprints.map((s) => {
              const sprintPct =
                s.totalTasks > 0
                  ? Math.round((s.completedTasks / s.totalTasks) * 100)
                  : 0;
              return (
                <Link
                  key={s.id}
                  href={`/dashboard/project/${s.projectId}`}
                  className="sprint-card"
                >
                  <div className="sprint-card-header">
                    <span className="sprint-card-name">{s.name}</span>
                    <span className="sprint-card-project">{s.projectName}</span>
                  </div>
                  <div className="sprint-card-bar">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${sprintPct}%` }}
                      />
                    </div>
                    <span className="sprint-card-stat">
                      {s.completedTasks}/{s.totalTasks} tasks
                    </span>
                  </div>
                  {s.endDate && (
                    <span className="sprint-card-date">
                      {formatRelativeDate(s.endDate)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Time Tracking Overview — full width */}
      <div className="dash-card dash-card-full">
        <h3>Time Overview</h3>
        <div className="time-overview">
          <div className="time-overview-summary">
            <div className="time-overview-stat">
              <span className="time-stat-value">{tt.totalEstimated}h</span>
              <span className="time-stat-label">Estimated</span>
            </div>
            <div className="time-overview-stat">
              <span className="time-stat-value">{tt.totalLogged}h</span>
              <span className="time-stat-label">Logged</span>
            </div>
            <div className="time-overview-stat">
              <span
                className={`time-stat-value ${timeUtilization > 100 ? "over" : ""}`}
              >
                {timeUtilization}%
              </span>
              <span className="time-stat-label">Utilization</span>
            </div>
          </div>

          {/* Per-project time bars */}
          <div className="time-project-bars">
            {projectSummaries
              .filter((p) => p.estimatedHours > 0 || p.loggedHours > 0)
              .map((p) => {
                const maxHours = Math.max(p.estimatedHours, p.loggedHours, 1);
                const estPct = (p.estimatedHours / maxHours) * 100;
                const logPct = (p.loggedHours / maxHours) * 100;
                const isOver = p.loggedHours > p.estimatedHours;
                return (
                  <div key={p.id} className="time-project-row">
                    <Link
                      href={`/dashboard/project/${p.id}`}
                      className="time-project-name"
                    >
                      {p.name}
                    </Link>
                    <div className="time-bar-container">
                      <div className="time-bar-track">
                        <div
                          className="time-bar-estimated"
                          style={{ width: `${estPct}%` }}
                          title={`Estimated: ${p.estimatedHours}h`}
                        />
                        <div
                          className={`time-bar-logged ${isOver ? "over" : ""}`}
                          style={{ width: `${logPct}%` }}
                          title={`Logged: ${p.loggedHours}h`}
                        />
                      </div>
                    </div>
                    <span className="time-bar-label">
                      {p.loggedHours}h / {p.estimatedHours}h
                    </span>
                  </div>
                );
              })}
            {projectSummaries.every(
              (p) =>
                (p.estimatedHours ?? 0) === 0 && (p.loggedHours ?? 0) === 0,
            ) && (
              <p className="dash-empty">
                No time estimates yet. Add estimates to your tasks to see the
                breakdown.
              </p>
            )}
          </div>

          {/* Legend */}
          <div className="time-legend">
            <span className="time-legend-item">
              <span className="time-legend-swatch estimated" /> Estimated
            </span>
            <span className="time-legend-item">
              <span className="time-legend-swatch logged" /> Logged
            </span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        {/* My Tasks */}
        <div className="dash-card">
          <h3>My Tasks</h3>
          {myActiveTasks.length === 0 ? (
            <p className="dash-empty">No tasks assigned to you.</p>
          ) : (
            <div className="dash-task-list">
              {myActiveTasks.map((t) => (
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
                      {t.estimatedHours != null && (
                        <span className="dash-task-time">
                          {" "}
                          · {t.loggedHours}/{t.estimatedHours}h
                        </span>
                      )}
                      {t.dueDate && (
                        <span
                          className={`dash-task-due ${new Date(t.dueDate) < new Date() ? "overdue" : ""}`}
                        >
                          {" "}
                          · {formatRelativeDate(t.dueDate)}
                        </span>
                      )}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Due Soon / Overdue */}
        <div className="dash-card">
          <h3>
            Upcoming Deadlines
            {overdueTasks.length > 0 && (
              <span className="overdue-badge">{overdueTasks.length}</span>
            )}
          </h3>
          {overdueTasks.length === 0 && dueSoonTasks.length === 0 ? (
            <p className="dash-empty">No upcoming deadlines.</p>
          ) : (
            <div className="dash-task-list">
              {overdueTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/project/${t.projectId}`}
                  className="dash-task-item overdue-item"
                >
                  <span className="overdue-icon">!</span>
                  <div className="dash-task-info">
                    <span className="dash-task-title">{t.title}</span>
                    <span className="dash-task-meta">
                      {t.projectName} ·{" "}
                      <span className="dash-task-due overdue">
                        {formatRelativeDate(t.dueDate)}
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
              {dueSoonTasks.map((t) => (
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
                      <span className="dash-task-due">
                        {formatRelativeDate(t.dueDate)}
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dash-grid">
        {/* Projects */}
        <div className="dash-card">
          <h3>Projects</h3>
          {projectSummaries.length === 0 ? (
            <p className="dash-empty">No projects yet.</p>
          ) : (
            <div className="dash-project-list">
              {projectSummaries.map((p) => (
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
            {(
              [
                ["High", "HIGH", byPriority.HIGH],
                ["Medium", "MEDIUM", byPriority.MEDIUM],
                ["Low", "LOW", byPriority.LOW],
              ] as const
            ).map(([label, key, count]) => (
              <div key={key} className="priority-row">
                <span className="priority-label">{label}</span>
                <div className="priority-bar">
                  <div
                    className={`priority-fill priority-${key.toLowerCase()}-fill`}
                    style={{
                      width: `${totalTasks > 0 ? (count / totalTasks) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="priority-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recently Completed — full width */}
      <div className="dash-card dash-card-full">
        <h3>Recently Completed</h3>
        {recentCompleted.length === 0 ? (
          <p className="dash-empty">No completed tasks yet.</p>
        ) : (
          <div className="dash-completed-grid">
            {recentCompleted.map((t) => (
              <div key={t.id} className="dash-completed-item">
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
  );
}
