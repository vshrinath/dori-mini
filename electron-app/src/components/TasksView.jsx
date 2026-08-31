// Desktop layout matches dori-portal's real task table
// (app/tasks/tasks-workspace.tsx + components/surfaces/data-table.tsx): one
// bordered panel wrapping a <table>, not a stack of divided EntityItem rows.
// Status is a checkbox-style toggle centered in its own column, priority is
// a plain bold span (red only when high, no badge/pill), due date is plain
// text. No @tanstack/react-table here — dori-mini's one sortable-by-nothing
// column set doesn't need it, just the same cell markup.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Search } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { FilterChip } from './ui/filter-chip.jsx';
import { Input } from './ui/input.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { cn } from '../lib/utils.js';

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' }
];

function TaskCompleteButton({ done, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      aria-label={done ? 'Completed' : 'Mark done'}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
        done
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border-soft text-transparent hover:border-primary hover:text-primary/40'
      )}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}

function priorityClass(priority) {
  return priority === 'high' || priority === 'HIGH' ? 'text-red-500' : 'text-muted-foreground';
}

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
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="bg-background sticky top-0 z-10 flex flex-col gap-2.5 border-b px-4 py-3">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && !tasks && (
          <div className="border-border bg-card rounded-panel space-y-px overflow-hidden border p-2">
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
        {filtered?.length > 0 && (
          <div className="border-border bg-card rounded-panel overflow-hidden border">
            <table className="w-full border-collapse">
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id} className="hover:bg-muted/45 transition-colors">
                    <td className="border-border w-[42px] border-b px-4 py-3 align-top last:border-b-0">
                      <TaskCompleteButton done={task.status === 'done'} onClick={() => markDone(task.id)} />
                    </td>
                    <td className="border-border border-b px-2 py-3 align-top last:border-b-0">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{task.title}</span>
                        {task.context?.scope && (
                          <span className="text-muted-foreground text-xs">From {task.context.scope}</span>
                        )}
                      </div>
                    </td>
                    <td className="border-border border-b px-4 py-3 align-top text-sm last:border-b-0">
                      {task.dueDate || task.due || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn('border-border border-b px-4 py-3 text-right align-top text-xs font-bold last:border-b-0', priorityClass(task.priority))}>
                      {task.priority || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
