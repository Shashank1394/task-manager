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
    console.log(tasks);
  }, [tasks]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!value.trim()) return;

    setTasks([...tasks, { text: value, completed: false }]);
    setValue("");
  };

  return (
    <div>
      <div>
        <h1>Task Manager</h1>
      </div>

      <div>
        <form onSubmit={handleSubmit}>
          <input
            value={value}
            placeholder="Enter a task..."
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </div>

      <div>
        <ul>
          {tasks.map((task, index) => (
            <li key={index}>{task.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
