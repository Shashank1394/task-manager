"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  createdAt: string;
};

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        setOrgs(data);
        setLoading(false);
      });
  }, []);

  const createOrg = async () => {
    if (!name.trim()) return;

    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    const newOrg = await res.json();

    setOrgs((prev) => [newOrg, ...prev]);
    setName("");
    setShowModal(false);
  };

  if (loading) return <p>Loading organizations...</p>;

  return (
    <div className="org-directory-page">
      <div className="org-hero">
        <div className="org-hero-copy">
          <span className="org-eyebrow">Workspace structure</span>
          <div className="org-header">
            <h1>Organizations</h1>
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              + Create
            </button>
          </div>
          <p className="org-hero-description">
            Group projects, members, and client access into clear delivery
            workspaces.
          </p>
        </div>
        <div className="org-hero-summary">
          <span className="org-hero-summary-label">Active spaces</span>
          <strong className="org-hero-summary-value">{orgs.length}</strong>
          <span className="org-hero-summary-meta">
            {orgs.length === 0
              ? "Create your first organization to start structuring work."
              : `${orgs.length} organization${orgs.length !== 1 ? "s" : ""} available in this workspace.`}
          </span>
        </div>
      </div>

      {orgs.length === 0 ? (
        <p className="org-empty">No organizations yet.</p>
      ) : (
        <div className="org-grid">
          {orgs.map((org) => (
            <Link
              href={`/dashboard/organizations/${org.id}`}
              key={org.id}
              className="org-card"
            >
              <span className="org-card-kicker">Organization</span>
              <h5>{org.name}</h5>
              <p className="org-card-summary">
                Open the organization hub to manage projects, members, and
                workspace settings.
              </p>
              <small>
                Created {new Date(org.createdAt).toLocaleDateString()}
              </small>
            </Link>
          ))}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h4>Create Organization</h4>

            <input
              type="text"
              placeholder="Organization name"
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

              <button className="btn btn-primary" onClick={createOrg}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
