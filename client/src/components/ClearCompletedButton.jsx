import client from "../api/client.js";

export default function ClearCompletedButton({ onCleared }) {
  const clearCompleted = async () => {
    try {
      await client.delete("/tasks"); // backend already filters by user
      onCleared();
    } catch (err) {
      console.error(err.response?.data?.error || err.message);
    }
  };

  return (
    <button
      onClick={clearCompleted}
      className="mt-6 px-4 py-2 bg-[#161616] border border-[#1c1c1c] rounded-md text-xs hover:bg-[#1e1e1e]"
    >
      Clear Completed
    </button>
  );
}
