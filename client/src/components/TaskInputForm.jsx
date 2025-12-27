import { useState } from "react";
import client from "../api/client.js";

export default function TaskInputForm({ onAdded }) {
  const [value, setValue] = useState("");

  const addTask = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    const res = await client.post("/tasks", { text: value });
    onAdded(res.data);
    setValue("");
  };

  return (
    <form onSubmit={addTask} className="flex gap-3 my-5">
      <input
        className="bg-[#0f0f0f] border border-[#1c1c1c] p-3 flex-1 rounded-md text-xs placeholder:text-gray-600"
        value={value}
        placeholder="Add a task..."
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="px-5 bg-[#161616] border border-[#1c1c1c] hover:bg-[#1e1e1e] transition rounded-md text-xs">
        Add Task
      </button>
    </form>
  );
}
