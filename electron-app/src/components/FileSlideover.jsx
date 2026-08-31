import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Check, Save, Edit3, Eye, AlertTriangle } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { TRANSITION, DURATION } from '../lib/motion.js';

function TiptapEditor({ initialContent, onChange, onSave }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: false }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose prose-headings:font-display max-w-none focus:outline-none min-h-[400px] p-6 text-foreground',
      },
    },
    onUpdate: ({ editor }) => {
      try {
        const md = editor.storage?.markdown?.getMarkdown() || editor.getText();
        onChange(md);
      } catch (err) {
        console.error('Markdown serialization failed:', err);
      }
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  return <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />;
}

export function FileSlideover({ relPath, onClose, onSaved }) {
  const [doc, setDoc] = useState(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const originalContentRef = useRef('');

  // Load document content
  useEffect(() => {
    if (!relPath) return;
    setDoc(undefined);
    setIsEditing(false);
    setIsDirty(false);
    setShowDiscardConfirm(false);
    setSaveStatus(null);

    window.dori
      .call('get_document', { path: relPath })
      .then((loaded) => {
        setDoc(loaded);
        if (loaded) {
          originalContentRef.current = loaded.content || '';
          setDraftContent(loaded.content || '');
        }
      })
      .catch((err) => {
        console.error('Failed to load document:', err);
        setDoc(null);
      });
  }, [relPath]);

  // Handle explicit save
  const handleSave = useCallback(async () => {
    if (!relPath || !isDirty) return;
    setIsSaving(true);
    try {
      await window.dori.call('save_document', {
        path: relPath,
        content: draftContent,
      });
      originalContentRef.current = draftContent;
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);

      // Refresh doc view data
      const refreshed = await window.dori.call('get_document', { path: relPath });
      setDoc(refreshed);
      if (onSaved) onSaved(relPath);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [relPath, isDirty, draftContent, onSaved]);

  // Handle close attempt
  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Global escape key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleRequestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRequestClose]);

  if (!relPath) return null;

  const wordCount = (doc?.content || draftContent).split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={handleRequestClose}
        style={{ transition: TRANSITION.backdrop }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
      />

      {/* Slideover Panel */}
      <div
        style={{ transition: TRANSITION.slideover }}
        className="relative z-10 flex h-full w-full max-w-3xl flex-col bg-background shadow-2xl border-l border-border"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5 bg-card">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                {doc?.type || 'Document'}
              </span>
              {isDirty && (
                <Badge variant="warning" size="compact">
                  Unsaved changes
                </Badge>
              )}
            </div>
            <h2 className="truncate text-base font-semibold text-foreground mt-0.5">
              {doc?.title || relPath}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mode toggle (Edit / View) */}
            {doc && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="gap-1.5"
              >
                {isEditing ? (
                  <>
                    <Eye size={14} />
                    <span>Preview</span>
                  </>
                ) : (
                  <>
                    <Edit3 size={14} />
                    <span>Edit</span>
                  </>
                )}
              </Button>
            )}

            {/* Save Button */}
            {isEditing && (
              <Button
                size="sm"
                variant={isDirty ? 'primary' : 'outline'}
                disabled={!isDirty || isSaving}
                onClick={handleSave}
                className="gap-1.5"
              >
                {saveStatus === 'saved' ? (
                  <>
                    <Check size={14} className="text-green-500" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>{isSaving ? 'Saving…' : 'Save'}</span>
                  </>
                )}
              </Button>
            )}

            {/* Close Button */}
            <button
              onClick={handleRequestClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Word count / meta bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/40 px-5 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{wordCount} words</span>
            <span>·</span>
            <span>{readingMinutes} min read</span>
            {doc?.date && (
              <>
                <span>·</span>
                <span>{doc.date}</span>
              </>
            )}
          </div>
          {saveStatus === 'error' && (
            <span className="text-red-500 font-medium">Failed to save document</span>
          )}
        </div>

        {/* Content Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {doc === undefined && (
            <div className="space-y-4 p-8">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}

          {doc === null && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Document could not be loaded.
            </div>
          )}

          {doc && isEditing && (
            <TiptapEditor
              key={relPath}
              initialContent={doc.content}
              onChange={(newMd) => {
                setDraftContent(newMd);
                setIsDirty(newMd !== originalContentRef.current);
              }}
              onSave={handleSave}
            />
          )}

          {doc && !isEditing && (
            <article className="mx-auto w-full max-w-2xl px-6 py-8">
              {/* Clean Frontmatter Metadata Block if present */}
              {(() => {
                const fm = doc.frontmatter || {};
                const metadataEntries = Object.entries({
                  Role: fm.role,
                  Organization: fm.org || fm.company,
                  Relationship: fm.relationship,
                  Projects: Array.isArray(fm.projects) ? fm.projects.join(', ') : fm.project,
                  'Last Contact': fm['last-contact'] || fm.lastContact,
                  Attendees: Array.isArray(fm.attendees) ? fm.attendees.join(', ') : null,
                  Status: fm.status,
                  Date: fm.date && fm.date !== doc?.date ? fm.date : null,
                }).filter(([, v]) => v != null && v !== '');

                if (metadataEntries.length === 0) return null;

                return (
                  <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl border border-border/70 bg-muted/30 p-3.5 text-xs">
                    {metadataEntries.map(([label, value]) => (
                      <div key={label} className="flex items-baseline gap-2 min-w-0">
                        <span className="font-semibold text-muted-foreground shrink-0">{label}:</span>
                        <span className="font-medium text-foreground truncate">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {doc.html ? (
                <div
                  className="prose dark:prose-invert max-w-none text-[15.5px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: doc.html }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This document can't be previewed.
                </p>
              )}
            </article>
          )}
        </div>

        {/* Discard Confirmation Modal */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-panel bg-card p-6 shadow-xl border border-border">
              <div className="flex items-center gap-3 text-amber-500 mb-3">
                <AlertTriangle size={20} />
                <h3 className="text-sm font-semibold text-foreground">Discard unsaved changes?</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                You have unsaved changes in this document. Closing will discard them.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  Keep Editing
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    setIsDirty(false);
                    onClose();
                  }}
                >
                  Discard Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
