import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Search, Calendar, Tag } from 'lucide-react';
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
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all',
        done
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border-soft text-transparent hover:border-primary hover:text-primary/40 hover:scale-105'
      )}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
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
    return q
      ? tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.context?.scope && t.context.scope.toLowerCase().includes(q))
        )
      : tasks;
  }, [tasks, query]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-5xl space-y-6">
        <RouteHeader
          title="Tasks"
          description="Action items and follow-ups extracted from meetings or added manually."
          meta={
            tasks ? (
              <Badge variant="muted" size="compact" className="text-xs">
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
              </Badge>
            ) : null
          }
        />

        {/* Filter and Search Bar */}
        <div className="flex items-center gap-2.5">
          {STATUSES.map((s) => (
            <FilterChip
              key={s.id}
              selected={status === s.id}
              onClick={() => setStatus(s.id)}
              className="text-sm font-medium px-3 py-1.5"
            >
              {s.label}
            </FilterChip>
          ))}
          <div className="relative ml-auto max-w-xs flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="h-9 pl-9 text-sm bg-card border-border-soft rounded-control"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!error && !tasks && (
          <div className="rounded-panel border border-border-soft bg-card p-4 space-y-3">
            <Skeleton className="h-12 w-full rounded-control" />
            <Skeleton className="h-12 w-full rounded-control" />
            <Skeleton className="h-12 w-full rounded-control" />
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
          <div className="rounded-panel border border-border-soft bg-card overflow-hidden shadow-xs divide-y divide-border-soft">
            {filtered.map((task) => {
              const isHigh = task.priority === 'high' || task.priority === 'HIGH';
              const isDone = task.status === 'done';
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-4 p-4.5 transition-colors hover:bg-muted/30"
                >
                  <TaskCompleteButton
                    done={isDone}
                    onClick={() => markDone(task.id)}
                  />

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <span
                      className={cn(
                        'block text-sm font-medium leading-relaxed',
                        isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {task.title}
                    </span>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {task.context?.scope && (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Tag size={13} className="shrink-0" />
                          <span>{task.context.scope}</span>
                        </span>
                      )}

                      {(task.dueDate || task.due) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar size={13} className="shrink-0" />
                          <span>{task.dueDate || task.due}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {isHigh && !isDone && (
                    <Badge variant="destructive" size="compact" className="text-xs">
                      High Priority
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
