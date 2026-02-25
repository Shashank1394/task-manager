"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar__logo">TaskManager</div>

      <nav className="sidebar__nav">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/dashboard/organizations">Organizations</Link>
        <Link href="/dashboard/projects">Projects</Link>
      </nav>
    </div>
  );
}
