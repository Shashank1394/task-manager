import TaskItem from "./TaskItem.jsx";

export default function TaskList({ tasks, setTasks }) {
  const onUpdated = (task) => {
    setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t)));
  };

  const onDeleted = (id) => {
    setTasks((prev) => prev.filter((t) => t._id !== id));
  };

  return (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <TaskItem
          key={task._id}
          task={task}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      ))}
    </ul>
  );
}
