import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { EntityItem, EntityList } from './EntityItem.jsx';
import { Badge } from './ui/badge.jsx';
import { ArticleViewer } from './ArticleViewer.jsx';

const LIST_LIMIT = 300;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function DocumentDetail({ relPath, onBack }) {
  const [doc, setDoc] = useState(undefined);

  useEffect(() => {
    setDoc(undefined);
    window.dori
      .call('get_document', { path: relPath })
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [relPath]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-3">
        <button
          onClick={onBack}
          aria-label="Back to Library"
          className="rounded-md p-1 text-muted-foreground hover:bg-[var(--space-nav-hover)]"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="truncate text-sm font-semibold">{doc?.title || relPath}</h1>
      </div>
      {doc === undefined && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {doc === null && <p className="p-4 text-sm text-muted-foreground">Document not found.</p>}
      {doc && <ArticleViewer content={doc.content} html={doc.html} />}
    </section>
  );
}

export function LibraryView() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedPath, setSelectedPath] = useState(null);

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
    if (typeFilter === 'all') return docs;
    return docs.filter((d) => (d.type || 'note') === typeFilter);
  }, [docs, typeFilter]);

  if (selectedPath) {
    return <DocumentDetail relPath={selectedPath} onBack={() => setSelectedPath(null)} />;
  }

  return (
    <EntityList
      header={
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm font-semibold">Library</h1>
          {types.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground-secondary"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      }
    >
      {error && <p className="p-4 text-sm text-red-500">{error}</p>}
      {!error && !docs && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {filtered?.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No documents found.</p>
      )}
      {filtered?.map((doc) => (
        <EntityItem
          key={doc.rel_path}
          title={doc.title}
          subtitle={
            <Badge variant="muted" size="compact">
              {doc.type || 'note'}
            </Badge>
          }
          meta={doc.date && formatDate(doc.date)}
          leading={<FileText size={16} />}
          onSelect={() => setSelectedPath(doc.rel_path)}
        />
      ))}
    </EntityList>
  );
}
