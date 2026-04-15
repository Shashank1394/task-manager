"use client";

import { useEffect, useState } from "react";

type ActivityItem = {
  id: string;
  type: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  task: { id: string; title: string } | null;
};

const typeIcons: Record<string, string> = {
  TASK_CREATED: "+",
  TASK_MOVED: "→",
  TASK_ASSIGNED: "👤",
  TASK_DELETED: "✕",
  COMMENT_ADDED: "💬",
  SPRINT_STARTED: "🏃",
  SPRINT_COMPLETED: "✓",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ActivityFeed({ projectId }: { projectId: string }) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/activity?limit=25`)
      .then((r) => r.json())
      .then(setActivities)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <p className="activity-loading">Loading activity...</p>;

  return (
    <div className="activity-feed">
      {activities.length === 0 ? (
        <p className="activity-empty">No activity yet.</p>
      ) : (
        <div className="activity-list">
          {activities.map((a) => (
            <div key={a.id} className="activity-item">
              <span className="activity-icon">{typeIcons[a.type] ?? "•"}</span>
              <div className="activity-content">
                <span className="activity-text">
                  <strong className="activity-user">
                    {a.user.name ?? "Someone"}
                  </strong>{" "}
                  {a.message}
                </span>
                <span className="activity-time">{timeAgo(a.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
