"use client";

import ThemeToggle from "../ThemeToggle";

export default function Topbar() {
  return (
    <div className="topbar">
      <div className="topbar__left">Dashboard</div>

      <div className="topbar__right">
        <ThemeToggle />
      </div>
    </div>
  );
}
