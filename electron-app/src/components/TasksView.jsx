import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Search } from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { FilterChip } from './ui/filter-chip.jsx';
import { Input } from './ui/input.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { cn } from '../lib/utils.js';

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' },
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
      ?.call('list_tasks', { status })
      .then(setTasks)
      .catch((e) => setError(e.message));
  }, [status]);

  useEffect(refresh, [refresh]);

  const markDone = useCallback(
    (id) => {
      window.dori
        ?.call('mark_task_done', { id })
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
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame">
        <RouteHeader
          title="Tasks"
          description="Action items and follow-ups extracted from meetings or added manually."
          meta={
            tasks ? (
              <Badge variant="muted" size="compact">
                {tasks.length}
              </Badge>
            ) : null
          }
        />

        {/* Filter and Search Bar */}
        <div className="mb-5 flex items-center gap-2.5">
          {STATUSES.map((s) => (
            <FilterChip
              key={s.id}
              selected={status === s.id}
              onClick={() => setStatus(s.id)}
            >
              {s.label}
            </FilterChip>
          ))}
          <div className="relative ml-auto max-w-xs flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="h-8 pl-7 text-xs bg-card border-border-soft rounded-control"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!error && !tasks && (
          <div className="rounded-panel border border-border-soft bg-card p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {filtered?.length === 0 && (
          <EmptyState
            icon={CheckCheck}
            title={tasks?.length === 0 ? 'No tasks' : 'No matches'}
            description={
              tasks?.length === 0
                ? 'Tasks extracted from meetings or added manually show up here.'
                : 'Try a different search term or status filter.'
            }
          />
        )}

        {filtered?.length > 0 && (
          <div className="rounded-panel border border-border-soft bg-card overflow-hidden shadow-xs">
            <table className="w-full border-collapse">
              <tbody>
                {filtered.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-muted/40 transition-colors border-b border-border-soft last:border-b-0"
                  >
                    <td className="w-12 px-4 py-3 align-top">
                      <TaskCompleteButton
                        done={task.status === 'done'}
                        onClick={() => markDone(task.id)}
                      />
                    </td>
                    <td className="px-2 py-3 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            task.status === 'done'
                              ? 'line-through text-muted-foreground'
                              : 'text-foreground'
                          )}
                        >
                          {task.title}
                        </span>
                        {task.context?.scope && (
                          <span className="text-muted-foreground text-xs">
                            From {task.context.scope}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {task.dueDate || task.due || '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right align-top text-xs font-semibold whitespace-nowrap',
                        priorityClass(task.priority)
                      )}
                    >
                      {task.priority || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
