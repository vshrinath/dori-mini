import { useState } from 'react';
import { X, StickyNote, Link2, FileText, Check } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';

export function AddToProfileModal({ isOpen, onClose, onAdded }) {
  const [tab, setTab] = useState('note');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setTitle('');
    setText('');
    setUrl('');
    setFile(null);
    setError(null);
    setDone(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (tab === 'note') {
        const slug = (title || 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filename = `profile/${slug}-${Date.now().toString().slice(-4)}.md`;
        const content = text.trim();
        await window.dori.call('save_document', {
          relPath: filename,
          content: `# ${title || 'Note'}\n\n${content}`,
        });
      } else if (tab === 'link') {
        await window.dori.call('capture_url', { url: url.trim() });
      } else if (file) {
        const sourcePath = window.dori.getFilePath(file);
        await window.dori.call('capture_file', { sourcePath });
      }
      setDone(true);
      onAdded?.();
    } catch (err) {
      setError(err.message || 'Failed to add to profile');
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: 'note', label: 'Note', icon: StickyNote },
    { id: 'link', label: 'Link', icon: Link2 },
    { id: 'file', label: 'File', icon: FileText },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm anim-rise"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex w-[500px] max-w-[92vw] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">Add to Profile</h2>
          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <Check size={24} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Added to your profile</h3>
              <p className="text-xs text-muted-foreground mt-1">
                It is now stored in your vault and searchable across Dori.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                Add Another
              </Button>
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Tab Pill Switcher */}
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    tab === id
                      ? 'bg-card text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {tab === 'note' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground-secondary">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Bio Summary, Speaking Topics..."
                    className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground-secondary">Note Content</label>
                  <textarea
                    rows={4}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Anything worth remembering about your work, background, or accomplishments..."
                    required
                    className="mt-1 w-full resize-none rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {tab === 'link' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground-secondary">URL</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {tab === 'file' && (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-foreground-secondary">
                  Choose Document / Résumé
                </label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                  className="mt-1 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || (tab === 'note' && !text.trim()) || (tab === 'link' && !url.trim()) || (tab === 'file' && !file)}>
                {saving ? 'Adding…' : 'Add to Profile'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
