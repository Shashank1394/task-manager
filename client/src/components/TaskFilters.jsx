export default function TaskFilters({ filter, setFilter }) {
  const btn = (type, label) => (
    <button
      onClick={() => setFilter(type)}
      className={
        filter === type ? "text-gray-200 underline" : "hover:text-gray-200"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="flex gap-4 mb-5 text-xs text-gray-400">
      {btn("all", "All")}
      {btn("completed", "Completed")}
      {btn("pending", "Pending")}
    </div>
  );
}
