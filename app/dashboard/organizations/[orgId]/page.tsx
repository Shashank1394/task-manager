"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type Project = {
  id: string;
  name: string;
  createdAt: string;
};

type Member = {
  id: string;
  role: "ADMIN" | "MEMBER";
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type OrgInfo = {
  id: string;
  name: string;
  members: { role: string }[];
};

export default function OrgPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;

  const [tab, setTab] = useState<"projects" | "members" | "settings">(
    "projects",
  );
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Project creation
  const [projectName, setProjectName] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(false);

  // Member invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Settings
  const [editName, setEditName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = org?.members?.[0]?.role === "ADMIN";

  useEffect(() => {
    if (!orgIdStr) return;

    Promise.all([
      fetch(`/api/organizations`).then((r) => r.json()),
      fetch(`/api/organizations/${orgIdStr}/projects`).then((r) => r.json()),
      fetch(`/api/organizations/${orgIdStr}/members`).then((r) => r.json()),
    ])
      .then(([orgs, projs, mems]) => {
        const thisOrg = (orgs as OrgInfo[]).find(
          (o: OrgInfo) => o.id === orgIdStr,
        );
        if (thisOrg) setOrg(thisOrg);
        setProjects(projs);
        setMembers(mems);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgIdStr]);

  const renameOrg = async () => {
    const nameToSave = editName || org?.name || "";
    if (!nameToSave.trim() || nameToSave.trim() === org?.name) return;
    setSavingName(true);
    const res = await fetch(`/api/organizations/${orgIdStr}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameToSave.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrg((prev) => (prev ? { ...prev, name: updated.name } : prev));
    } else {
      const data = await res.json();
      alert(data.error);
    }
    setSavingName(false);
  };

  const deleteOrg = async () => {
    if (
      !confirm(
        `Delete "${org?.name}"? This will permanently remove all projects, tasks, and data. This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    const res = await fetch(`/api/organizations/${orgIdStr}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/dashboard/organizations");
    } else {
      const data = await res.json();
      alert(data.error);
      setDeleting(false);
    }
  };

  const createProject = async () => {
    if (!projectName.trim()) return;

    const res = await fetch(`/api/organizations/${orgIdStr}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName }),
    });

    if (res.ok) {
      const newProject = await res.json();
      setProjects((prev) => [newProject, ...prev]);
      setProjectName("");
      setShowProjectModal(false);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");

    const res = await fetch(`/api/organizations/${orgIdStr}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    const data = await res.json();
    if (!res.ok) {
      setInviteError(data.error);
    } else {
      setMembers((prev) => [...prev, data]);
      setInviteEmail("");
      setInviteRole("MEMBER");
    }
    setInviting(false);
  };

  const changeRole = async (memberId: string, newRole: "ADMIN" | "MEMBER") => {
    const res = await fetch(`/api/organizations/${orgIdStr}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role: newRole }),
    });

    if (res.ok) {
      const updated = await res.json();
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const removeMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this organization?`)) return;

    const res = await fetch(`/api/organizations/${orgIdStr}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });

    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="org-page">
      {/* Header */}
      <div className="org-page-header">
        <h1>{org?.name ?? "Organization"}</h1>
        {isAdmin && tab === "projects" && (
          <button
            className="btn btn-primary"
            onClick={() => setShowProjectModal(true)}
          >
            + New Project
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="org-tabs">
        <button
          className={`org-tab ${tab === "projects" ? "active" : ""}`}
          onClick={() => setTab("projects")}
        >
          Projects
          <span className="org-tab-count">{projects.length}</span>
        </button>
        <button
          className={`org-tab ${tab === "members" ? "active" : ""}`}
          onClick={() => setTab("members")}
        >
          Members
          <span className="org-tab-count">{members.length}</span>
        </button>
        {isAdmin && (
          <button
            className={`org-tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        )}
      </div>

      {/* Projects Tab */}
      {tab === "projects" && (
        <>
          {projects.length === 0 ? (
            <p className="org-empty">
              No projects yet. Create one to get started.
            </p>
          ) : (
            <div className="org-grid">
              {projects.map((p) => (
                <Link
                  href={`/dashboard/project/${p.id}`}
                  key={p.id}
                  className="org-card"
                >
                  <h5>{p.name}</h5>
                  <small>
                    Created {new Date(p.createdAt).toLocaleDateString()}
                  </small>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Members Tab */}
      {tab === "members" && (
        <div className="members-section">
          {/* Invite Form (admin only) */}
          {isAdmin && (
            <div className="invite-form">
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") inviteMember();
                }}
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "ADMIN" | "MEMBER")
                }
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                className="btn btn-primary"
                onClick={inviteMember}
                disabled={inviting}
              >
                {inviting ? "Inviting..." : "Invite"}
              </button>
              {inviteError && (
                <span className="invite-error">{inviteError}</span>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="members-list">
            {members.map((m) => (
              <div key={m.id} className="member-row">
                <div className="member-info">
                  <div className="member-avatar">
                    {m.user.image ? (
                      <Image src={m.user.image} alt="" width={32} height={32} />
                    ) : (
                      <span>{m.user.name?.[0]?.toUpperCase() ?? "?"}</span>
                    )}
                  </div>
                  <div className="member-details">
                    <span className="member-name">
                      {m.user.name ?? "Unknown"}
                    </span>
                    <span className="member-email">{m.user.email}</span>
                  </div>
                </div>
                <div className="member-actions">
                  <span className={`role-badge role-${m.role.toLowerCase()}`}>
                    {m.role}
                  </span>
                  {isAdmin && (
                    <>
                      <select
                        className="role-select"
                        value={m.role}
                        onChange={(e) =>
                          changeRole(m.id, e.target.value as "ADMIN" | "MEMBER")
                        }
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <button
                        className="member-remove"
                        onClick={() =>
                          removeMember(
                            m.id,
                            m.user.name ?? m.user.email ?? "this member",
                          )
                        }
                        title="Remove member"
                      >
                        &times;
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {tab === "settings" && isAdmin && (
        <div className="org-settings">
          <div className="settings-section">
            <h4>Organization Name</h4>
            <div className="settings-row">
              <input
                type="text"
                value={editName ?? org?.name ?? ""}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameOrg();
                }}
              />
              <button
                className="btn btn-primary"
                onClick={renameOrg}
                disabled={
                  savingName ||
                  !(editName ?? org?.name ?? "").trim() ||
                  (editName ?? org?.name ?? "").trim() === org?.name
                }
              >
                {savingName ? "Saving..." : "Rename"}
              </button>
            </div>
          </div>

          <div className="settings-section settings-danger">
            <h4>Danger Zone</h4>
            <p>
              Delete this organization and all its projects, tasks, and
              associated data. This action is permanent and cannot be undone.
            </p>
            <button
              className="btn btn-danger"
              onClick={deleteOrg}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Organization"}
            </button>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showProjectModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h4>Create Project</h4>
            <input
              type="text"
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createProject();
              }}
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowProjectModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={createProject}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
