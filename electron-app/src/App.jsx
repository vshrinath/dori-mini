import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox as InboxIcon, Search } from 'lucide-react';
import { InboxView } from './components/InboxItem.jsx';
import { DecisionCard } from './components/DecisionCard.jsx';
import { Badge } from './components/ui/badge.jsx';
import { Button } from './components/ui/button.jsx';
import { EmptyState } from './components/ui/empty-state.jsx';
import { FilterChip } from './components/ui/filter-chip.jsx';
import { Input } from './components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.jsx';
import { Skeleton } from './components/ui/skeleton.jsx';
import { TooltipProvider } from './components/ui/tooltip.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { TasksView } from './components/TasksView.jsx';
import { ProjectView } from './components/ProjectView.jsx';
import { ProfileView } from './components/ProfileView.jsx';
import { LibraryView } from './components/LibraryView.jsx';
import { FileSlideover } from './components/FileSlideover.jsx';
import { SearchModal } from './components/SearchModal.jsx';
import { ChatView } from './components/ChatView.jsx';

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
    (actionId, clarificationId, choiceId) => {
      window.dori
        .call(actionId, { clarificationId, choiceId })
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
                  // dori-portal's real clarification actions stack full-width
                  // ghost buttons (app/inbox/page.tsx) — fine for its usual
                  // 2-3 person-disambiguation candidates, but our clarification
                  // candidates are "which project" and can list every project
                  // in the vault, which would overrun the card. Dropdown instead.
                  <>
                    <Select
                      onValueChange={(choiceId) => decide('approve_inbox_item', item.clarificationId, choiceId)}
                    >
                      <SelectTrigger size="sm" className="w-56">
                        <SelectValue placeholder="Choose destination…" />
                      </SelectTrigger>
                      <SelectContent>
                        {item.candidates?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                            {c.detail ? ` — ${c.detail}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      onClick={() => decide('ignore_inbox_item', item.clarificationId)}
                    >
                      Dismiss
                    </Button>
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
  const [active, setActive] = useState('chat');
  const [profileVersion, setProfileVersion] = useState(0);
  const [activeDocument, setActiveDocument] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Global search shortcut (/ and Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          active={active}
          onSelect={setActive}
          onOpenSearch={() => setIsSearchOpen(true)}
          profileVersion={profileVersion}
        />
        <main
          key={active}
          className="anim-rise flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {active === 'chat' && <ChatView />}
          {active === 'inbox' && <InboxScreen />}
          {active === 'tasks' && <TasksView />}
          {active === 'library' && (
            <LibraryView onSelectDocument={(path) => setActiveDocument(path)} />
          )}
          {active === 'profile' && (
            <ProfileView onProfileChanged={() => setProfileVersion((v) => v + 1)} />
          )}
          {active.startsWith('project:') && (
            <ProjectView
              projectPath={active.slice(8)}
              onSelectProject={(path) => setActive(`project:${path}`)}
            />
          )}
        </main>

        {/* Global Search Modal */}
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectDocument={(path) => setActiveDocument(path)}
        />

        {/* Global File Slideover Drawer */}
        <FileSlideover
          relPath={activeDocument}
          onClose={() => setActiveDocument(null)}
        />
      </div>
    </TooltipProvider>
  );
}
