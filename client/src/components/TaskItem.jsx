import { useState } from "react";
import client from "../api/client.js";

export default function TaskItem({ task, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);

  const toggle = async () => {
    const res = await client.patch(`/tasks/${task._id}/toggle`);
    onUpdated(res.data);
  };

  const save = async () => {
    if (!text.trim()) return;
    const res = await client.put(`/tasks/${task._id}`, { text });
    onUpdated(res.data);
    setEditing(false);
  };

  const del = async () => {
    await client.delete(`/tasks/${task._id}`);
    onDeleted(task._id);
  };

  return (
    <li className="flex justify-between items-center bg-[#0f0f0f] border border-[#1a1a1a] p-3 rounded-md hover:border-gray-800 transition">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={toggle}
        className="scale-110 accent-gray-700"
      />
      {editing ? (
        <input
          className="bg-[#161616] px-2 py-1 rounded text-xs flex-1 mx-3"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoFocus
        />
      ) : (
        <span
          className={`text-xs flex-1 mx-3 ${task.completed ? "line-through text-gray-600" : ""}`}
        >
          {task.text}
        </span>
      )}
      {editing ? (
        <button
          onClick={save}
          className="text-xs text-green-400 hover:text-green-300"
        >
          Save
        </button>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-gray-500 hover:text-blue-400"
        >
          Edit
        </button>
      )}
      <button
        onClick={del}
        className="text-xs ml-4 text-gray-600 hover:text-red-400"
      >
        Delete
      </button>
    </li>
  );
}
