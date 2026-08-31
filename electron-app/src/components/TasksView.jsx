import { useEffect, useState } from 'react';
import { EntityItem, EntityList } from './EntityItem.jsx';

export function TasksView() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.dori
      .call('list_tasks', { status: 'open' })
      .then(setTasks)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <EntityList header={<h1 className="text-sm font-semibold">Tasks</h1>}>
      {error && <p className="p-4 text-sm text-red-500">{error}</p>}
      {!error && !tasks && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {tasks?.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No open tasks.</p>
      )}
      {tasks?.map((task) => (
        <EntityItem
          key={task.id}
          title={task.title}
          meta={task.dueDate || task.due}
        />
      ))}
    </EntityList>
  );
}
