"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ProjectSettingsPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const projectIdParam = Array.isArray(projectId) ? projectId[0] : projectId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoOwner, setRepoOwner] = useState<string | null>(null);
  const [repoName, setRepoName] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [saveMsg, setSaveMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectIdParam}`);
        if (!res.ok) throw new Error("Failed to load project");
        const data = await res.json();
        setName(data.name ?? "");
        setDescription(data.description ?? "");
        setOrgId(data.organizationId ?? null);
        setRepoOwner(data.repoOwner ?? null);
        setRepoName(data.repoName ?? null);
      } catch {
        setErrorMsg("Failed to load project settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectIdParam]);

  const handleSave = async () => {
    if (!name.trim()) {
      setErrorMsg("Project name is required");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/projects/${projectIdParam}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to save");
        return;
      }

      setSaveMsg("Settings saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setErrorMsg("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    setSaving(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/projects/${projectIdParam}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disconnectGitHub: true }),
      });

      if (res.ok) {
        setRepoOwner(null);
        setRepoName(null);
        setSaveMsg("GitHub repository disconnected");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to disconnect");
      }
    } catch {
      setErrorMsg("Failed to disconnect GitHub");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/projects/${projectIdParam}`, {
        method: "DELETE",
      });

      if (res.ok && orgId) {
        router.push(`/dashboard/organizations/${orgId}`);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to delete project");
        setDeleting(false);
      }
    } catch {
      setErrorMsg("Failed to delete project");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button
          className="settings-back"
          onClick={() => router.push(`/dashboard/project/${projectIdParam}`)}
        >
          ← Back to Board
        </button>
        <h2>Project Settings</h2>
      </div>

      {errorMsg && <div className="settings-error">{errorMsg}</div>}
      {saveMsg && <div className="settings-success">{saveMsg}</div>}

      {/* General Settings */}
      <section className="settings-section">
        <h3>General</h3>
        <div className="settings-field">
          <label htmlFor="project-name">Project Name</label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
          />
        </div>
        <div className="settings-field">
          <label htmlFor="project-desc">Description</label>
          <textarea
            id="project-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
          />
        </div>
        <button
          className="settings-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </section>

      {/* GitHub Integration */}
      <section className="settings-section">
        <h3>GitHub Integration</h3>
        {repoOwner && repoName ? (
          <div className="settings-github-connected">
            <div className="settings-github-repo">
              <span className="settings-github-icon">⚙</span>
              <a
                href={`https://github.com/${repoOwner}/${repoName}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {repoOwner}/{repoName}
              </a>
            </div>
            <p className="settings-hint">
              Disconnecting will remove the link to this repository. GitHub sync
              data (issues, PRs, commits) will remain but no further syncs will
              occur.
            </p>
            <button
              className="settings-danger-btn"
              onClick={handleDisconnectGitHub}
              disabled={saving}
            >
              Disconnect Repository
            </button>
          </div>
        ) : (
          <p className="settings-hint">
            No GitHub repository connected. You can connect one from the project
            board&apos;s GitHub panel.
          </p>
        )}
      </section>

      {/* Danger Zone */}
      <section className="settings-section settings-danger-zone">
        <h3>Danger Zone</h3>
        <p className="settings-hint">
          Deleting this project will permanently remove all tasks, boards,
          comments, labels, subtasks, and GitHub sync data. This action cannot
          be undone.
        </p>
        {!confirmDelete ? (
          <button
            className="settings-danger-btn"
            onClick={() => setConfirmDelete(true)}
          >
            Delete Project
          </button>
        ) : (
          <div className="settings-confirm-delete">
            <p>Are you sure? This cannot be undone.</p>
            <div className="settings-confirm-actions">
              <button
                className="settings-danger-btn"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                className="settings-cancel-btn"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
