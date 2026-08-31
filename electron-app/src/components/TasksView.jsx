import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Search } from 'lucide-react';
import { EntityItem, EntityList } from './EntityItem.jsx';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { FilterChip } from './ui/filter-chip.jsx';
import { Input } from './ui/input.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { IconButton } from './IconButton.jsx';

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' }
];

export function TasksView() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('open');
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => {
    setTasks(null);
    window.dori
      .call('list_tasks', { status })
      .then(setTasks)
      .catch((e) => setError(e.message));
  }, [status]);

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

  const filtered = useMemo(() => {
    if (!tasks) return tasks;
    const q = query.trim().toLowerCase();
    return q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks;
  }, [tasks, query]);

  return (
    <EntityList
      header={
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">Tasks</h1>
            {tasks && (
              <Badge variant="muted" size="compact">
                {tasks.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {STATUSES.map((s) => (
              <FilterChip key={s.id} selected={status === s.id} onClick={() => setStatus(s.id)}>
                {s.label}
              </FilterChip>
            ))}
            <div className="relative ml-auto max-w-48 flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks"
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        </div>
      }
    >
      {error && <p className="p-4 text-sm text-red-500">{error}</p>}
      {!error && !tasks && (
        <div className="space-y-px p-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {filtered?.length === 0 && (
        <EmptyState
          icon={CheckCheck}
          title={tasks.length === 0 ? 'No tasks' : 'No matches'}
          description={
            tasks.length === 0
              ? 'Tasks extracted from meetings or added manually show up here.'
              : 'Try a different search term.'
          }
        />
      )}
      {filtered?.map((task) => (
        <EntityItem
          key={task.id}
          title={task.title}
          meta={task.dueDate || task.due}
          actions={
            status !== 'done' && (
              <IconButton label="Mark done" onClick={() => markDone(task.id)}>
                <Check size={14} />
              </IconButton>
            )
          }
        />
      ))}
    </EntityList>
  );
}
