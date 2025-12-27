import { useState } from "react";
import client from "../api/client.js";

export default function RegisterForm({ onSwitch }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      await client.post("/auth/register", form);
      onSwitch();
      setForm({ name: "", email: "", password: "" });
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="border border-[#1c1c1c] rounded-md p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          placeholder="Name"
          className="bg-[#0f0f0f] p-2 rounded text-xs"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Email"
          className="bg-[#0f0f0f] p-2 rounded text-xs"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Password"
          type="password"
          className="bg-[#0f0f0f] p-2 rounded text-xs"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <button className="bg-[#161616] p-2 rounded text-xs">Register</button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </form>

      {/* Switch to Login */}
      <button
        onClick={onSwitch}
        className="mt-4 text-xs text-gray-500 hover:text-blue-400 w-full text-center"
        type="button"
      >
        Already have an account? Login instead
      </button>
    </div>
  );
}
