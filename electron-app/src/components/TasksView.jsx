import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { EntityItem, EntityList } from './EntityItem.jsx';
import { Button } from './ui/button.jsx';

export function TasksView() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    window.dori
      .call('list_tasks', { status: 'open' })
      .then(setTasks)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  const markDone = useCallback(
    (id) => {
      window.dori
        .call('mark_task_done', { id })
        .then(refresh)
        .catch((e) => setError(e.message));
    },
    [refresh]
  );

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
          actions={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Mark done"
              onClick={() => markDone(task.id)}
            >
              <Check size={14} />
            </Button>
          }
        />
      ))}
    </EntityList>
  );
}
