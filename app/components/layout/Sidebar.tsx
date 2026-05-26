"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

type Org = {
  id: string;
  name: string;
  members: { role: string }[];
};

type Project = {
  id: string;
  name: string;
};

function getInitialBadge(value: string, fallback: string) {
  const initial = value.trim().charAt(0).toUpperCase();
  return initial || fallback;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [projectsByOrg, setProjectsByOrg] = useState<Record<string, Project[]>>(
    {},
  );
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [showUserMenu, setShowUserMenu] = useState(false);

  const inClientView = pathname.startsWith("/dashboard/client/");
  const clientOnly =
    orgsLoaded &&
    orgs.length > 0 &&
    orgs.every((org) => org.members?.[0]?.role === "CLIENT");
  const showGlobalDashboardLink = orgsLoaded ? !clientOnly : !inClientView;
  const homeHref = clientOnly
    ? `/dashboard/client/${orgs[0]!.id}`
    : showGlobalDashboardLink
      ? "/dashboard"
      : pathname;

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
        const clientMatch = pathname.match(/\/client\/([^/]+)/);
        if (clientMatch) {
          setExpandedOrgs((prev) => new Set([...prev, clientMatch[1]]));
        }
        // Fetch projects for each org
        data.forEach((org) => {
          const isClient = org.members?.[0]?.role === "CLIENT";
          if (isClient) {
            // For clients, fetch their assigned projects via client dashboard
            fetch(`/api/client/${org.id}/dashboard`)
              .then((r) => r.json())
              .then((dashboard: { projects: Project[] }) => {
                setProjectsByOrg((prev) => ({
                  ...prev,
                  [org.id]: dashboard.projects.map((p) => ({
                    id: p.id,
                    name: p.name,
                  })),
                }));
                // Auto-expand if a project under it is active
                const projMatch = pathname.match(/\/project\/([^/]+)/);
                if (
                  projMatch &&
                  dashboard.projects.some((p) => p.id === projMatch[1])
                ) {
                  setExpandedOrgs((prev) => new Set([...prev, org.id]));
                }
              })
              .catch(() => {});
            return;
          }
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
      .catch(() => {})
      .finally(() => setOrgsLoaded(true));
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
        <Link href={homeHref}>DevPilot</Link>
        <span className="sidebar__logo-subtitle">Delivery control room</span>
      </div>

      <nav className="sidebar__nav">
        {showGlobalDashboardLink && (
          <Link
            href="/dashboard"
            className={`sidebar__link ${isActive("/dashboard") ? "sidebar__link--active" : ""}`}
          >
            <span className="sidebar__icon" aria-hidden="true">
              DB
            </span>
            Dashboard
          </Link>
        )}

        <div className="sidebar__section-label">Organizations</div>

        {orgs.map((org) => {
          const isClient = org.members?.[0]?.role === "CLIENT";

          if (isClient) {
            return (
              <div key={org.id} className="sidebar__org">
                <div className="sidebar__org-header">
                  <Link
                    href={`/dashboard/client/${org.id}`}
                    className={`sidebar__link ${isActive(`/dashboard/client/${org.id}`) ? "sidebar__link--active" : ""}`}
                  >
                    <span className="sidebar__icon" aria-hidden="true">
                      CL
                    </span>
                    {org.name}
                    <span className="sidebar__client-tag">Client</span>
                  </Link>
                  {(projectsByOrg[org.id]?.length ?? 0) > 0 && (
                    <button
                      className={`sidebar__expand-btn ${expandedOrgs.has(org.id) ? "expanded" : ""}`}
                      onClick={() => toggleOrg(org.id)}
                      title="Toggle projects"
                    >
                      ▸
                    </button>
                  )}
                </div>
                {expandedOrgs.has(org.id) && (
                  <div className="sidebar__projects">
                    {(projectsByOrg[org.id] ?? []).map((proj) => (
                      <Link
                        key={proj.id}
                        href={`/dashboard/client/${org.id}#client-project-${proj.id}`}
                        className="sidebar__link sidebar__link--project"
                      >
                        <span className="sidebar__icon" aria-hidden="true">
                          {getInitialBadge(proj.name, "P")}
                        </span>
                        {proj.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={org.id} className="sidebar__org">
              <div className="sidebar__org-header">
                <Link
                  href={`/dashboard/organizations/${org.id}`}
                  className={`sidebar__link ${isActive(`/dashboard/organizations/${org.id}`) ? "sidebar__link--active" : ""}`}
                >
                  <span className="sidebar__icon" aria-hidden="true">
                    {getInitialBadge(org.name, "O")}
                  </span>
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
                      <span className="sidebar__icon" aria-hidden="true">
                        {getInitialBadge(proj.name, "P")}
                      </span>
                      {proj.name}
                    </Link>
                  ))}
                  {projectsByOrg[org.id]?.length === 0 && (
                    <span className="sidebar__empty">No projects</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

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
