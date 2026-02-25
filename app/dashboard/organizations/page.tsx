"use client";

import { useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  createdAt: string;
};

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        setOrgs(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading organizations...</p>;

  if (!orgs || orgs.length === 0) {
    return (
      <div>
        <h1>Organizations</h1>
        <p>No organizations yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Organizations</h1>

      <div className="org-grid">
        {orgs.map((org) => (
          <div key={org.id} className="org-card">
            <h5>{org.name}</h5>
            <small>
              Created {new Date(org.createdAt).toLocaleDateString()}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
