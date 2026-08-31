// Matches dori-portal's real app/library/page.tsx: a responsive card grid
// (icon + type/status eyebrow, title, footer meta row), not a flat divided-row
// list — real Library is one of the primary card-grid surfaces, same family
// as the Inbox decision cards, not the secondary EntityItem list pattern.
// Dropped: the "New document" create form (no artifact-creation action here)
// and the version/status fields (dori-mini's vault documents are plain files,
// not versioned artifacts with a status lifecycle).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, FileCode2, FileText, Search } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Input } from './ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { Skeleton } from './ui/skeleton.jsx';
export function LibraryView({ onSelectDocument }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.dori
      .call('list_documents', { limit: LIST_LIMIT })
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

  if (selectedPath) {
    return <DocumentDetail relPath={selectedPath} onBack={() => setSelectedPath(null)} />;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="bg-background sticky top-0 z-10 flex flex-col gap-2.5 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Library</h1>
          {docs && (
            <Badge variant="muted" size="compact">
              {docs.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {types.length > 0 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm">
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
          <div className="relative ml-auto max-w-48 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && !docs && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {filtered?.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={docs.length === 0 ? 'Nothing written yet' : 'No matches'}
            description={
              docs.length === 0
                ? 'When a meeting produces minutes, or a document is added to the vault, it lands here.'
                : 'Try a different filter or search term.'
            }
          />
        )}
        {filtered?.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((doc) => {
              const Icon = doc.type === 'note' || !doc.type ? FileText : FileCode2;
              return (
                <button
                  key={doc.rel_path}
                  onClick={() => onSelectDocument?.(doc.rel_path)}
                  className="group rounded-panel bg-card flex flex-col border border-[var(--border-soft)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--hairline-strong)] hover:shadow-sm"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="bg-muted text-foreground-secondary rounded-lg p-2 transition-colors group-hover:bg-[var(--surface-tint)] group-hover:text-[var(--brand-accent-text)]">
                      <Icon size={18} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-micro text-muted-foreground truncate font-semibold uppercase tracking-wider">
                        {doc.type || 'note'}
                      </div>
                    </div>
                  </div>
                  <h3 className="text-foreground line-clamp-2 text-sm font-medium leading-snug">{doc.title}</h3>
                  <div className="text-micro text-muted-foreground mt-auto flex items-center pt-4">
                    {doc.date && <span>{formatDate(doc.date)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
