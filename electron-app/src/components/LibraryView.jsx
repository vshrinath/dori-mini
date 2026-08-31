import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileCode2, FileText, Search, Plus } from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Input } from './ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { Skeleton } from './ui/skeleton.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function LibraryView({ onSelectDocument }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.dori
      ?.call('list_documents', {})
      .then(setDocs)
      .catch((e) => setError(e.message));
  }, []);

  const types = useMemo(() => {
    if (!docs) return [];
    return [...new Set(docs.map((d) => d.type || 'note'))].sort();
  }, [docs]);

  const filtered = useMemo(() => {
    if (!docs) return null;
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => typeFilter === 'all' || (d.type || 'note') === typeFilter)
      .filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [docs, typeFilter, query]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame">
        <RouteHeader
          title="Library"
          description="Recent documents, drafts, and notes stored in your vault."
          meta={
            docs ? (
              <Badge variant="muted" size="compact">
                {docs.length}
              </Badge>
            ) : null
          }
        />

        {/* Filter and Search Bar */}
        <div className="mb-6 flex items-center gap-3">
          {types.length > 0 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm" className="w-36 bg-card border-border-soft">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative max-w-xs flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…"
              className="h-8 pl-8 text-xs bg-card border-border-soft rounded-control"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!error && !docs && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 w-full rounded-panel" />
            <Skeleton className="h-32 w-full rounded-panel" />
            <Skeleton className="h-32 w-full rounded-panel" />
          </div>
        )}

        {filtered?.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={docs.length === 0 ? 'Nothing in library yet' : 'No matches'}
            description={
              docs.length === 0
                ? 'When notes or documents are captured to your vault, they will appear here.'
                : 'Try a different filter or search term.'
            }
          />
        )}

        {filtered?.length > 0 && (
          <div className="anim-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const Icon = doc.type === 'note' || !doc.type ? FileText : FileCode2;
              return (
                <button
                  key={doc.rel_path}
                  onClick={() => onSelectDocument?.(doc.rel_path)}
                  className="universal-card group flex flex-col p-4 text-left"
                >
                  <div className="mb-3 flex items-center gap-2.5">
                    <div className="rounded-lg bg-muted p-2 text-foreground-secondary transition-colors group-hover:bg-[var(--surface-tint)] group-hover:text-[var(--brand-accent-text)]">
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                        {doc.type || 'note'}
                      </span>
                    </div>
                  </div>

                  <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
                    {doc.title}
                  </h3>

                  <div className="mt-auto flex items-center justify-between pt-4 text-micro text-muted-foreground">
                    <span>{doc.date ? formatDate(doc.date) : 'Document'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
