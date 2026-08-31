import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox as InboxIcon, Search } from 'lucide-react';
import { RouteHeader } from './components/ui/RouteHeader.jsx';
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
import { SettingsModal } from './components/SettingsModal.jsx';
import { ChatView } from './components/ChatView.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const INBOX_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'clarification', label: 'Clarifications' },
  { id: 'inbox_file', label: 'Files' },
];

function InboxScreen() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => {
    window.dori
      ?.call('list_inbox', {})
      .then(setInbox)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  const decide = useCallback(
    (actionId, clarificationId, choiceId) => {
      window.dori
        ?.call(actionId, { clarificationId, choiceId })
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
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-3xl">
        <RouteHeader
          title="Inbox"
          description="Everything waiting on you — approve, file, or dismiss."
          meta={
            inbox?.length > 0 ? (
              <span className="rounded-full bg-[var(--surface-tint)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-accent-text)]">
                {inbox.length} waiting
              </span>
            ) : null
          }
        />

        {/* Filter and Search Bar */}
        <div className="mb-6 flex items-center gap-2.5">
          {INBOX_TYPES.map((t) => (
            <FilterChip
              key={t.id}
              selected={type === t.id}
              onClick={() => setType(t.id)}
            >
              {t.label}
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
              placeholder="Search inbox…"
              className="h-8 pl-7 text-xs bg-card border-border-soft rounded-control"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!error && !inbox && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-panel" />
            <Skeleton className="h-20 w-full rounded-panel" />
          </div>
        )}

        {filtered?.length === 0 && (
          <EmptyState
            icon={InboxIcon}
            title={inbox?.length === 0 ? 'Nothing needs you right now' : 'No matches'}
            description={
              inbox?.length === 0
                ? 'When Dori prepares something — a draft to approve, a meeting to file, a suggestion — it lands here.'
                : 'Nothing in this category matches your search.'
            }
          />
        )}

        {filtered?.length > 0 && (
          <div className="space-y-3">
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
                      <Select
                        onValueChange={(choiceId) =>
                          decide('approve_inbox_item', item.clarificationId, choiceId)
                        }
                      >
                        <SelectTrigger size="sm" className="w-56 bg-card border-border-soft">
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
      </div>
    </div>
  );
}

export function App() {
  const [active, setActive] = useState('chat');
  const [profileVersion, setProfileVersion] = useState(0);
  const [activeDocument, setActiveDocument] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Global keyboard shortcuts (/ & Cmd+K for search, Cmd+, for settings)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput =
        tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--surface-canvas)]">
        <Sidebar
          active={active}
          onSelect={setActive}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onNewNote={() => setActive('chat')}
          profileVersion={profileVersion}
        />
        <main
          key={active}
          className="anim-rise flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {active === 'chat' && (
            <ChatView onOpenSettings={() => setIsSettingsOpen(true)} />
          )}
          {active === 'inbox' && <InboxScreen />}
          {active === 'tasks' && <TasksView />}
          {active === 'library' && (
            <LibraryView onSelectDocument={(path) => setActiveDocument(path)} />
          )}
          {active === 'profile' && (
            <ProfileView
              onProfileChanged={() => setProfileVersion((v) => v + 1)}
            />
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

        {/* Global Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
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
