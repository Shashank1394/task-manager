"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Task = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch tasks
    fetch(`/api/projects/${projectId}/tasks`)
      .then((res) => res.json())
      .then((data) => setTasks(data));

    // Fetch GitHub status
    fetch(`/api/projects/${projectId}/github-status`)
      .then((res) => res.json())
      .then((data) => setGithub(data))
      .finally(() => setLoading(false));
  }, [projectId]);

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
          <div key={status} className="column">
            <h5>{status.replace("_", " ")}</h5>

            {items.map((task) => (
              <div key={task.id} className="task-card">
                {task.title}
              </div>
            ))}
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
    </div>
  );
}
