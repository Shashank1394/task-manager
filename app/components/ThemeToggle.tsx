"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-theme") || "light"
      : "light",
  );
  const [mounted, setMounted] = useState(false);

  // After hydration, mark component as mounted
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  if (!mounted) return null;

  return (
    <button className="btn btn-outline-secondary btn-sm" onClick={toggleTheme}>
      {theme === "light" ? "🌙" : "☀"}
    </button>
  );
}
