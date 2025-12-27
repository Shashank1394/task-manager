export default function TaskSearchBar({ search, setSearch }) {
  return (
    <input
      className="w-full bg-[#0f0f0f] border border-[#1c1c1c] p-2 rounded-md text-xs mb-4 placeholder:text-gray-600"
      placeholder="Search tasks..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  );
}
