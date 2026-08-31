import { useEffect, useState, useRef, useCallback } from 'react';
import { Search, FileText, FileCode2, ArrowRight, CornerDownLeft, X } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { TRANSITION } from '../lib/motion.js';

export function SearchModal({ isOpen, onClose, onSelectDocument }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Query search_vault on query change
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      window.dori
        .call('search_vault', { query: trimmed, limit: 15 })
        .then((payload) => {
          setResults(payload?.hits || []);
          setSelectedIndex(0);
        })
        .catch((err) => {
          console.error('Search failed:', err);
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          const hit = results[selectedIndex];
          onClose();
          onSelectDocument(hit.rel_path);
        }
      }
    },
    [results, selectedIndex, onClose, onSelectDocument]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ transition: TRANSITION.backdrop }}
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity"
      />

      {/* Modal Card */}
      <div
        onKeyDown={handleKeyDown}
        style={{ transition: TRANSITION.modal }}
        className="relative z-10 flex w-full max-w-xl flex-col rounded-panel bg-card shadow-2xl border border-border overflow-hidden"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vault documents…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground p-1 rounded"
            >
              <X size={14} />
            </button>
          )}
          <Badge variant="muted" size="compact" className="text-micro">
            ESC to close
          </Badge>
        </div>

        {/* Results List */}
        <div className="max-h-96 min-h-[120px] overflow-y-auto p-2">
          {loading && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Searching…
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No matching documents found.
            </div>
          )}

          {!loading && !query.trim() && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Type keywords to search across all notes, meetings, and decisions.
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="flex flex-col gap-1">
              {results.map((hit, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = hit.type === 'note' || !hit.type ? FileText : FileCode2;

                return (
                  <button
                    key={hit.rel_path}
                    onClick={() => {
                      onClose();
                      onSelectDocument(hit.rel_path);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--space-sidebar-field)] text-foreground'
                        : 'text-foreground-secondary hover:bg-[var(--space-nav-hover)]'
                    }`}
                  >
                    <div className="p-1.5 rounded bg-muted text-muted-foreground shrink-0">
                      <Icon size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {hit.title || hit.rel_path}
                        </span>
                        {hit.type && (
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                            {hit.type}
                          </span>
                        )}
                      </div>
                      {hit.snippet && (
                        <p className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5">
                          {hit.snippet.replace(/<[^>]+>/g, '')}
                        </p>
                      )}
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <span>Open</span>
                        <CornerDownLeft size={12} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
