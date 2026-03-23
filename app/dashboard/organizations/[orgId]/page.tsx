"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  createdAt: string;
};

export default function OrgProjectsPage() {
  const { orgId } = useParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch(`/api/organizations/${orgId}/projects`)
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
        setLoading(false);
      });
  }, [orgId]);

  const createProject = async () => {
    if (!name.trim()) return;

    const res = await fetch(`/api/organizations/${orgId}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    const newProject = await res.json();

    setProjects((prev) => [newProject, ...prev]);
    setName("");
    setShowModal(false);
  };

  if (loading) return <p>Loading projects...</p>;

  return (
    <div>
      <div className="org-header">
        <h1>Projects</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Create
        </button>
      </div>

      {projects.length === 0 ? (
        <p>No projects yet.</p>
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

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h4>Create Project</h4>

            <input
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
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
