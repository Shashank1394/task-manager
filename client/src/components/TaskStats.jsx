export default function TaskStats({ total, completed, pending }) {
  return (
    <div className="flex gap-6 text-xs text-gray-500 mb-4">
      <p>Total: {total}</p>
      <p>Completed: {completed}</p>
      <p>Pending: {pending}</p>
    </div>
  );
}
