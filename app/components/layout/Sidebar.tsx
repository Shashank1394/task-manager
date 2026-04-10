"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

type Org = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
};

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [projectsByOrg, setProjectsByOrg] = useState<Record<string, Project[]>>(
    {},
  );
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data: Org[]) => {
        setOrgs(data);
        // Auto-expand the org if we're on its page
        const orgMatch = pathname.match(/\/organizations\/([^/]+)/);
        if (orgMatch) {
          setExpandedOrgs(new Set([orgMatch[1]]));
        }
        // Fetch projects for each org
        data.forEach((org) => {
          fetch(`/api/organizations/${org.id}/projects`)
            .then((r) => r.json())
            .then((projects: Project[]) => {
              setProjectsByOrg((prev) => ({ ...prev, [org.id]: projects }));
              // Auto-expand org if a project under it is active
              const projMatch = pathname.match(/\/project\/([^/]+)/);
              if (projMatch && projects.some((p) => p.id === projMatch[1])) {
                setExpandedOrgs((prev) => new Set([...prev, org.id]));
              }
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, [pathname]);

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const isActive = (href: string) => pathname === href;

  return (
    <div className="sidebar">
      <div className="sidebar__logo">
        <Link href="/dashboard">DevPilot</Link>
      </div>

      <nav className="sidebar__nav">
        <Link
          href="/dashboard"
          className={`sidebar__link ${isActive("/dashboard") ? "sidebar__link--active" : ""}`}
        >
          <span className="sidebar__icon">📊</span>
          Dashboard
        </Link>

        <div className="sidebar__section-label">Organizations</div>

        {orgs.map((org) => (
          <div key={org.id} className="sidebar__org">
            <div className="sidebar__org-header">
              <Link
                href={`/dashboard/organizations/${org.id}`}
                className={`sidebar__link ${isActive(`/dashboard/organizations/${org.id}`) ? "sidebar__link--active" : ""}`}
              >
                <span className="sidebar__icon">🏢</span>
                {org.name}
              </Link>
              <button
                className={`sidebar__expand-btn ${expandedOrgs.has(org.id) ? "expanded" : ""}`}
                onClick={() => toggleOrg(org.id)}
                title="Toggle projects"
              >
                ▸
              </button>
            </div>

            {expandedOrgs.has(org.id) && (
              <div className="sidebar__projects">
                {(projectsByOrg[org.id] ?? []).map((proj) => (
                  <Link
                    key={proj.id}
                    href={`/dashboard/project/${proj.id}`}
                    className={`sidebar__link sidebar__link--project ${isActive(`/dashboard/project/${proj.id}`) ? "sidebar__link--active" : ""}`}
                  >
                    <span className="sidebar__icon">📁</span>
                    {proj.name}
                  </Link>
                ))}
                {projectsByOrg[org.id]?.length === 0 && (
                  <span className="sidebar__empty">No projects</span>
                )}
              </div>
            )}
          </div>
        ))}

        {orgs.length === 0 && (
          <span className="sidebar__empty">No organizations yet</span>
        )}
      </nav>

      {session?.user && (
        <div className="sidebar__user-wrapper">
          {showUserMenu && (
            <div className="sidebar__user-menu">
              <div className="sidebar__user-menu-header">
                <span className="sidebar__user-menu-name">
                  {session.user.name}
                </span>
                <span className="sidebar__user-menu-email">
                  {session.user.email}
                </span>
              </div>
              <button
                className="sidebar__user-menu-signout"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </div>
          )}
          <button
            className="sidebar__user"
            onClick={() => setShowUserMenu((v) => !v)}
          >
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt=""
                className="sidebar__user-avatar"
                width={32}
                height={32}
              />
            ) : (
              <span className="sidebar__user-avatar-fallback">
                {session.user.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            )}
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{session.user.name}</span>
              <span className="sidebar__user-email">{session.user.email}</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
