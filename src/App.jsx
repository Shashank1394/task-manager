import { useEffect } from "react";
import { useState } from "react";

export default function App() {
  const [tasks, setTasks] = useState(() => {
    const stored = localStorage.getItem("tasks");
    return stored ? JSON.parse(stored) : [];
  });

  const [value, setValue] = useState("");

  useEffect(() => {
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;

    setTasks([
      ...tasks,
      { id: crypto.randomUUID(), text: value, completed: false },
    ]);
    setValue("");
  };

  const toggleTask = (id) => {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task,
      ),
    );
  };

  const handleDelete = (id) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  return (
    <div>
      <h1>Task Manager</h1>

      <div>
        <form onSubmit={(e) => handleSubmit(e)}>
          <input
            value={value}
            placeholder="Enter a task"
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </div>

      <div>
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <span className={task.completed ? "line-through" : ""}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task.id)}
                />
                {task.text}
              </span>
              <button onClick={() => handleDelete(task.id)}>❌</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
