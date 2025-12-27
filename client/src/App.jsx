import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header.jsx";
import LoginForm from "./auth/LoginForm.jsx";
import RegisterForm from "./auth/RegisterForm.jsx";
import LogoutButton from "./auth/LogoutButton.jsx";
import DeleteAccountButton from "./auth/DeleteAccountButton.jsx";
import TaskInputForm from "./components/TaskInputForm.jsx";
import TaskSearchBar from "./components/TaskSearchBar.jsx";
import TaskFilters from "./components/TaskFilters.jsx";
import TaskStats from "./components/TaskStats.jsx";
import TaskList from "./components/TaskList.jsx";
import client from "./api/client.js";

export default function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [authView, setAuthView] = useState("login"); // login | register

  const loadTasks = useCallback(async () => {
    try {
      const res = await client.get("/tasks", { params: { search, filter } });
      setTasks(res.data);
    } catch (err) {
      console.error(err.response?.data?.error || err.message);
    }
  }, [search, filter]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setTimeout(() => setUser({}), 0);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const run = async () => {
      await loadTasks();
    };
    run();
  }, [user, loadTasks]);

  const handleLogout = () => {
    setUser(null);
    setTasks([]);
    localStorage.removeItem("token");
    setAuthView("login");
  };

  const handleClearCompleted = async () => {
    try {
      await client.delete("/tasks"); // backend already clears only this user's completed tasks
      loadTasks();
    } catch (err) {
      console.error(err.response?.data?.error || err.message);
    }
  };

  // AUTH SCREEN
  if (!user) {
    return (
      <div className="p-5 max-w-md mx-auto font-sans">
        <Header />

        {authView === "login" ? (
          <div className="mt-5">
            <LoginForm
              onLogin={(u) => setUser(u)}
              onSwitch={() => setAuthView("register")}
            />
          </div>
        ) : (
          <div className="mt-5">
            <RegisterForm
              onRegister={() => setAuthView("login")}
              onSwitch={() => setAuthView("login")}
            />
          </div>
        )}
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="p-5 max-w-2xl mx-auto font-sans">
      <div className="flex">
        <Header />
        <LogoutButton onLogout={handleLogout} />
      </div>

      {/* Add Delete Account */}
      <DeleteAccountButton
        onDeleted={() => {
          setUser(null);
          setTasks([]);
          setAuthView("login");
        }}
      />

      <TaskInputForm onAdded={loadTasks} />
      <TaskSearchBar search={search} setSearch={setSearch} />

      <TaskStats
        total={tasks.length}
        completed={tasks.filter((t) => t.completed).length}
        pending={tasks.filter((t) => !t.completed).length}
      />

      <TaskFilters filter={filter} setFilter={setFilter} />
      <TaskList tasks={tasks} setTasks={setTasks} onRefresh={loadTasks} />

      {/* CLEAR COMPLETED BUTTON */}
      {tasks.some((t) => t.completed) && (
        <button
          onClick={handleClearCompleted}
          className="mt-6 px-4 py-2 bg-[#161616] border border-[#1c1c1c] rounded-md text-xs hover:bg-[#1e1e1e]"
          type="button"
        >
          Clear Completed
        </button>
      )}
    </div>
  );
}
