"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../ThemeToggle";

type SearchResults = {
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    projectId: string;
    projectName: string;
  }[];
  projects: {
    id: string;
    name: string;
    organization: { name: string };
  }[];
  members: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }[];
};

export default function Topbar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data: SearchResults = await res.json();
        setResults(data);
        setOpen(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (path: string) => {
    setOpen(false);
    setQuery("");
    router.push(path);
  };

  const hasResults =
    results &&
    (results.tasks.length > 0 ||
      results.projects.length > 0 ||
      results.members.length > 0);

  return (
    <div className="topbar">
      <div className="topbar__left">Dashboard</div>

      <div className="topbar__center" ref={wrapperRef}>
        <div className="global-search">
          <input
            type="text"
            className="global-search-input"
            placeholder="Search tasks, projects, people..."
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              if (results) setOpen(true);
            }}
          />
          {loading && <span className="global-search-spinner" />}
        </div>

        {open && results && (
          <div className="global-search-dropdown">
            {!hasResults && (
              <p className="global-search-empty">
                No results for &ldquo;{query}&rdquo;
              </p>
            )}

            {results.tasks.length > 0 && (
              <div className="search-section">
                <h6 className="search-section-title">Tasks</h6>
                {results.tasks.map((t) => (
                  <button
                    key={t.id}
                    className="search-result-item"
                    onClick={() =>
                      navigate(`/dashboard/project/${t.projectId}`)
                    }
                  >
                    <span
                      className={`search-priority priority-${t.priority.toLowerCase()}`}
                    />
                    <div className="search-result-text">
                      <span className="search-result-title">{t.title}</span>
                      <span className="search-result-sub">
                        {t.projectName} · {t.status.replace("_", " ")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {results.projects.length > 0 && (
              <div className="search-section">
                <h6 className="search-section-title">Projects</h6>
                {results.projects.map((p) => (
                  <button
                    key={p.id}
                    className="search-result-item"
                    onClick={() => navigate(`/dashboard/project/${p.id}`)}
                  >
                    <span className="search-icon">📁</span>
                    <div className="search-result-text">
                      <span className="search-result-title">{p.name}</span>
                      <span className="search-result-sub">
                        {p.organization.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {results.members.length > 0 && (
              <div className="search-section">
                <h6 className="search-section-title">People</h6>
                {results.members.map((m) => (
                  <div key={m.id} className="search-result-item search-member">
                    <span className="search-avatar">
                      {m.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="search-result-text">
                      <span className="search-result-title">
                        {m.name ?? "Unknown"}
                      </span>
                      <span className="search-result-sub">{m.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="topbar__right">
        <ThemeToggle />
      </div>
    </div>
  );
}
