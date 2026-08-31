import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Inbox as InboxIcon, Search, X } from 'lucide-react';
import { InboxView } from './components/InboxItem.jsx';
import { DecisionCard } from './components/DecisionCard.jsx';
import { Badge } from './components/ui/badge.jsx';
import { EmptyState } from './components/ui/empty-state.jsx';
import { FilterChip } from './components/ui/filter-chip.jsx';
import { Input } from './components/ui/input.jsx';
import { Skeleton } from './components/ui/skeleton.jsx';
import { TooltipProvider } from './components/ui/tooltip.jsx';
import { IconButton } from './components/IconButton.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { TasksView } from './components/TasksView.jsx';
import { ProjectView } from './components/ProjectView.jsx';
import { ProfileView } from './components/ProfileView.jsx';
import { LibraryView } from './components/LibraryView.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const INBOX_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'clarification', label: 'Clarifications' },
  { id: 'inbox_file', label: 'Files' }
];

function InboxScreen() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => {
    window.dori
      .call('list_inbox', {})
      .then(setInbox)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  const decide = useCallback(
    (actionId, clarificationId) => {
      window.dori
        .call(actionId, { clarificationId })
        .then(refresh)
        .catch((e) => setError(e.message));
    },
    [refresh]
  );

  const filtered = useMemo(() => {
    if (!inbox) return inbox;
    const q = query.trim().toLowerCase();
    return inbox
      .filter((item) => type === 'all' || item.type === type)
      .filter((item) => !q || item.title.toLowerCase().includes(q));
  }, [inbox, type, query]);

  return (
    <InboxView
      header={
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">Inbox</h1>
            {inbox && (
              <Badge variant="muted" size="compact">
                {inbox.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {INBOX_TYPES.map((t) => (
              <FilterChip key={t.id} selected={type === t.id} onClick={() => setType(t.id)}>
                {t.label}
              </FilterChip>
            ))}
            <div className="relative ml-auto max-w-48 flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search inbox"
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        </div>
      }
    >
      {error && <p className="p-4 text-sm text-red-500">{error}</p>}
      {!error && !inbox && (
        <div className="space-y-px p-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {filtered?.length === 0 && (
        <EmptyState
          icon={InboxIcon}
          title={inbox.length === 0 ? 'Nothing pending' : 'No matches'}
          description={
            inbox.length === 0
              ? 'Captures that need a routing decision will show up here.'
              : 'Try a different filter or search term.'
          }
        />
      )}
      {filtered?.length > 0 && (
        <div className="space-y-3 p-4">
          {filtered.map((item) => (
            <DecisionCard
              key={item.clarificationId || item.relPath}
              type={item.type}
              title={item.title}
              domain={item.domain}
              createdAt={formatDate(item.createdAt)}
              actions={
                item.clarificationId && (
                  <>
                    <IconButton label="Approve" onClick={() => decide('approve_inbox_item', item.clarificationId)}>
                      <Check size={14} />
                    </IconButton>
                    <IconButton label="Ignore" onClick={() => decide('ignore_inbox_item', item.clarificationId)}>
                      <X size={14} />
                    </IconButton>
                  </>
                )
              }
            />
          ))}
        </div>
      )}
    </InboxView>
  );
}

export function App() {
  const [active, setActive] = useState('inbox');
  const [profileVersion, setProfileVersion] = useState(0);

  return (
    <TooltipProvider>
      <div className="flex h-screen">
        <Sidebar active={active} onSelect={setActive} profileVersion={profileVersion} />
        <div className="flex min-w-0 flex-1 flex-col">
          {active === 'inbox' && <InboxScreen />}
          {active === 'tasks' && <TasksView />}
          {active === 'library' && <LibraryView />}
          {active === 'profile' && (
            <ProfileView onProfileChanged={() => setProfileVersion((v) => v + 1)} />
          )}
          {active.startsWith('project:') && <ProjectView projectPath={active.slice(8)} />}
        </div>
      </div>
    </TooltipProvider>
  );
}
