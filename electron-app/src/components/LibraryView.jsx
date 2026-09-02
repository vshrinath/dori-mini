import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileCode2, FileText, Search } from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Input } from './ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { api } from '../lib/api.js';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function LibraryView({ onSelectDocument }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.listDocuments()
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
      .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.rel_path && d.rel_path.toLowerCase().includes(q)));
  }, [docs, typeFilter, query]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-5xl space-y-6">
        <RouteHeader
          title="Library"
          description="Recent documents, drafts, and notes stored in your vault."
          meta={
            docs ? (
              <Badge variant="muted" size="compact" className="text-xs">
                {docs.length} {docs.length === 1 ? 'item' : 'items'}
              </Badge>
            ) : null
          }
        />

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {types.length > 0 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm" className="w-40 bg-card border-border-soft text-sm font-medium">
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

          <div className="relative max-w-xs flex-1 min-w-[220px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter library…"
              className="h-9 pl-9 text-sm bg-card border-border-soft rounded-control"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!error && !docs && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 w-full rounded-panel" />
            <Skeleton className="h-40 w-full rounded-panel" />
            <Skeleton className="h-40 w-full rounded-panel" />
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
          <div className="anim-stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const Icon = doc.type === 'note' || !doc.type ? FileText : FileCode2;
              return (
                <button
                  key={doc.rel_path}
                  onClick={() => onSelectDocument?.(doc.rel_path)}
                  className="universal-card group flex flex-col p-5 text-left transition-all hover:border-[var(--hairline-strong)] hover:shadow-md"
                >
                  <div className="mb-3.5 flex items-center justify-between">
                    <div className="rounded-lg bg-muted p-2 text-foreground-secondary transition-colors group-hover:bg-[var(--surface-tint)] group-hover:text-primary">
                      <Icon size={18} strokeWidth={1.75} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {doc.type || 'note'}
                    </span>
                  </div>

                  <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                    {doc.title}
                  </h3>

                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                    {doc.rel_path}
                  </p>

                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-[var(--border-soft)] text-xs text-muted-foreground">
                    <span>{doc.date ? formatDate(doc.date) : 'Document'}</span>
                    <span className="font-mono text-xs opacity-70 group-hover:opacity-100 transition-opacity">
                      Open ↗
                    </span>
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
