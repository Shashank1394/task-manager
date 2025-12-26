import { useState, useEffect } from "react";
import Header from "./components/Header";

export default function App() {
  const [tasks, setTasks] = useState(() => {
    const stored = localStorage.getItem("tasks");
    return stored ? JSON.parse(stored) : [];
  });

  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks]);

  const addTask = (e) => {
    e.preventDefault();
    if (!value.trim()) return;

    setTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: value, completed: false },
    ]);
    setValue("");
  };

  const toggleCompleted = (id) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task,
      ),
    );
  };

  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) => prev.filter((task) => !task.completed));
  };

  const startEditing = (task) => {
    setEditingId(task.id);
    setEditText(task.text);
    setEditText(task.text);
  };

  const saveEdit = (id) => {
    if (!editText.trim()) return;

    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, text: editText } : task)),
    );
    setEditingId(null);
  };

  const filteredTasks = tasks.filter((task) => {
    if (filter === "completed") return task.completed;
    if (filter === "pending") return !task.completed;
    return true;
  });

  const searchedTasks = filteredTasks.filter((task) =>
    task.text.toLowerCase().includes(search.toLowerCase()),
  );

  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pending = total - done;

  return (
    <div className="p-5 max-w-2xl mx-auto font-sans">
      <Header />

      {/* Add Task Form */}
      <form onSubmit={addTask} className="flex gap-3 my-5">
        <input
          className="bg-[#0f0f0f] border border-[#1c1c1c] p-3 flex-1 rounded-md 
                     placeholder:text-gray-600 focus:outline-none focus:border-gray-700"
          value={value}
          placeholder="Add a task..."
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="px-5 rounded-md bg-[#161616] border border-[#1c1c1c] 
                     hover:bg-[#1e1e1e] transition text-xs"
          type="submit"
        >
          Add Task
        </button>
      </form>

      {/* Search */}
      {total > 0 && (
        <input
          className="w-full bg-[#0f0f0f] border border-[#1c1c1c] p-2 rounded-md text-xs mb-4 
                     placeholder:text-gray-600 focus:outline-none focus:border-gray-700"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {/* Stats */}
      {total > 0 && (
        <div className="flex gap-6 text-xs text-gray-500 mb-4">
          <p>Total: {total}</p>
          <p>Completed: {done}</p>
          <p>Pending: {pending}</p>
        </div>
      )}

      {/* Filters */}
      {total > 0 && (
        <div className="flex gap-4 mb-5 text-xs text-gray-400">
          <button
            onClick={() => setFilter("all")}
            className={
              filter === "all"
                ? "text-gray-200 underline"
                : "hover:text-gray-200"
            }
          >
            All
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={
              filter === "completed"
                ? "text-gray-200 underline"
                : "hover:text-gray-200"
            }
          >
            Completed
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={
              filter === "pending"
                ? "text-gray-200 underline"
                : "hover:text-gray-200"
            }
          >
            Pending
          </button>
        </div>
      )}

      {/* Task List */}
      <ul className="space-y-3">
        {searchedTasks.map((task) => (
          <li
            key={task.id}
            className="flex justify-between items-center bg-[#0f0f0f] border border-[#1a1a1a] 
                                       p-3 rounded-md hover:border-gray-800 transition"
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => toggleCompleted(task.id)}
              className="scale-110 accent-gray-700"
            />

            {/* Task Text or Edit Field */}
            {editingId === task.id ? (
              <input
                className="bg-[#161616] border border-[#1c1c1c] px-2 py-1 rounded text-xs flex-1 mx-3 focus:outline-none"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit(task.id)}
                autoFocus
              />
            ) : (
              <span
                className={`text-xs flex-1 mx-3 ${task.completed ? "line-through text-gray-600" : ""}`}
              >
                {task.text}
              </span>
            )}

            {/* Edit / Save Button */}
            {editingId === task.id ? (
              <button
                onClick={() => saveEdit(task.id)}
                className="text-xs text-green-400 hover:text-green-300"
              >
                Save
              </button>
            ) : (
              <button
                onClick={() => startEditing(task)}
                className="text-xs text-gray-500 hover:text-blue-400"
              >
                Edit
              </button>
            )}

            {/* Delete Button */}
            <button
              onClick={() => deleteTask(task.id)}
              className="text-xs ml-4 text-gray-600 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Empty State */}
      {searchedTasks.length === 0 && total === 0 && (
        <p className="text-center mt-10 text-gray-700 text-sm">
          No tasks added yet.
        </p>
      )}

      {searchedTasks.length === 0 && total > 0 && (
        <p className="text-center mt-10 text-gray-700 text-sm">
          No matching tasks found.
        </p>
      )}

      {/* Clear Completed */}
      {done > 0 && (
        <button
          onClick={clearCompleted}
          className="mt-6 px-4 py-2 bg-[#161616] border border-[#1c1c1c] rounded-md text-xs hover:bg-[#1e1e1e]"
        >
          Clear Completed
        </button>
      )}
    </div>
  );
}
