import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Check,
  Save,
  Edit3,
  Eye,
  AlertTriangle,
  Calendar,
  Sparkles,
  Video,
  ExternalLink,
  FileText,
  List,
  Clock,
  User,
  Copy,
  RefreshCw,
  Play,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { TRANSITION } from '../lib/motion.js';

const CONVERTIBLE_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.epub', '.rtf', '.odt'];

function isConvertibleDocument(relPath, doc) {
  if (!relPath && !doc) return false;
  const target = (relPath || doc?.relPath || '').toLowerCase();
  const hasExt = CONVERTIBLE_EXTENSIONS.some((ext) => target.endsWith(ext));
  const hasType = ['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'document'].includes(doc?.type?.toLowerCase());
  return hasExt || hasType;
}

function extractYoutubeMetadata(doc, relPath) {
  if (!doc && !relPath) return null;
  const fm = doc?.frontmatter || {};
  const path = (relPath || doc?.relPath || '').toLowerCase();
  const isYt =
    doc?.type === 'youtube' ||
    fm.type === 'youtube' ||
    fm.source === 'youtube' ||
    (typeof fm.url === 'string' && (fm.url.includes('youtube.com') || fm.url.includes('youtu.be'))) ||
    path.startsWith('yt/');

  if (!isYt) return null;

  // Extract video ID
  let videoId = null;
  const url = fm.url || '';
  const vMatch = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^&#?]+)/);
  if (vMatch) videoId = vMatch[1];

  // Extract chapters from frontmatter or content
  const chapters = [];
  if (Array.isArray(fm.chapters)) {
    for (const c of fm.chapters) {
      if (typeof c === 'string') {
        const m = c.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s+[-—–]?\s*(.+)/);
        if (m) chapters.push({ time: m[1], title: m[2].trim() });
        else chapters.push({ time: '', title: c });
      } else if (c && typeof c === 'object') {
        chapters.push({
          time: c.time || (c.start_time != null ? new Date(c.start_time * 1000).toISOString().substr(14, 5) : ''),
          title: c.title || c.name || 'Chapter',
        });
      }
    }
  }

  if (chapters.length === 0 && doc?.content) {
    // Parse chapters from markdown body (e.g. ## Chapters\n- 00:00 Intro\n- 02:30 Discussion)
    const chapSection = doc.content.match(/##\s*Chapters\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
    if (chapSection) {
      const lines = chapSection[1].split('\n').filter(Boolean);
      for (const line of lines) {
        const m = line.match(/(?:-\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s+[-—–]?\s*(.+)/);
        if (m) {
          chapters.push({ time: m[1], title: m[2].trim() });
        }
      }
    }
  }

  // Extract description from frontmatter or content
  let description = fm.description || '';
  if (!description && doc?.content) {
    const descSection = doc.content.match(/##\s*Description\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
    if (descSection) {
      description = descSection[1].trim();
    }
  }

  return {
    isYt: true,
    url: fm.url,
    videoId,
    channel: fm.channel || fm.uploader || fm.author,
    duration: fm.duration || fm.duration_string,
    uploadDate: fm.upload_date || fm.uploadDate || fm.date,
    chapters,
    description,
  };
}

function TiptapEditor({ initialContent, onChange, onSave, editable = true }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: false }),
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-6 text-foreground text-[17px] leading-[1.75]',
      },
    },
    onUpdate: ({ editor: ed }) => {
      try {
        const md = ed.storage?.markdown?.getMarkdown() || ed.getText();
        onChange?.(md);
      } catch (err) {
        console.error('Markdown serialization failed:', err);
      }
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && initialContent !== undefined && editor.getText() !== initialContent) {
      editor.commands.setContent(initialContent || '');
    }
  }, [initialContent, editor]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave?.();
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

  // Conversion State
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState(null);
  const [isConverted, setIsConverted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load document content
  useEffect(() => {
    if (!relPath) return;
    setDoc(undefined);
    setIsEditing(false);
    setIsDirty(false);
    setShowDiscardConfirm(false);
    setSaveStatus(null);
    setIsConverting(false);
    setConversionError(null);
    setIsConverted(false);

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

  // Handle document conversion via convert_document action
  const handleConvertDocument = useCallback(async () => {
    if (!relPath) return;
    setIsConverting(true);
    setConversionError(null);

    try {
      const result = await window.dori.call('convert_document', { filePath: relPath });
      if (result && result.markdown) {
        const markdown = result.markdown;
        setDoc((prev) => ({
          ...(prev || { relPath, title: relPath.split('/').pop(), type: 'document' }),
          content: markdown,
          body: markdown,
          html: null,
          isConverted: true,
        }));
        setDraftContent(markdown);
        originalContentRef.current = markdown;
        setIsConverted(true);
        setIsEditing(false);
      } else {
        throw new Error('Conversion returned empty markdown result.');
      }
    } catch (err) {
      console.error('Document conversion failed:', err);
      setConversionError(err?.message || 'Conversion failed. Make sure parser dependencies are available.');
    } finally {
      setIsConverting(false);
    }
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

  const ytMeta = useMemo(() => extractYoutubeMetadata(doc, relPath), [doc, relPath]);
  const isConvertible = useMemo(() => isConvertibleDocument(relPath, doc), [relPath, doc]);

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
        className="relative z-10 flex h-full w-full md:w-1/2 max-w-none flex-col bg-background shadow-2xl border-l border-border animate-dialog-in"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5 bg-card">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                {ytMeta ? 'YouTube Media Note' : isConverted ? 'Converted Markdown' : doc?.type || 'Document'}
              </span>
              {isDirty && (
                <Badge variant="warning" size="compact">
                  Unsaved changes
                </Badge>
              )}
              {isConverted && (
                <Badge variant="secondary" size="compact" className="text-[10px]">
                  Markdown Preview
                </Badge>
              )}
            </div>
            <h2 className="truncate text-base font-semibold text-foreground mt-0.5">
              {doc?.title || relPath}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Convert Document Action Button */}
            {isConvertible && !isConverted && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleConvertDocument}
                disabled={isConverting}
                className="gap-1.5 text-xs shadow-xs"
              >
                <Sparkles size={13} className={isConverting ? 'animate-spin' : 'text-[var(--brand-accent)]'} />
                <span>{isConverting ? 'Converting…' : 'Preview as Markdown'}</span>
              </Button>
            )}

            {/* Mode toggle (Edit / View) */}
            {(doc || isConverted) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="gap-1.5 text-xs"
              >
                {isEditing ? (
                  <>
                    <Eye size={13} />
                    <span>Preview</span>
                  </>
                ) : (
                  <>
                    <Edit3 size={13} />
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
                className="gap-1.5 text-xs"
              >
                {saveStatus === 'saved' ? (
                  <>
                    <Check size={13} className="text-green-500" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Save size={13} />
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
            {ytMeta?.channel && (
              <>
                <span>·</span>
                <span className="font-medium text-foreground">{ytMeta.channel}</span>
              </>
            )}
          </div>
          {saveStatus === 'error' && (
            <span className="text-red-500 font-medium">Failed to save document</span>
          )}
        </div>

        {/* Content Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {doc === undefined && !isConverting && (
            <div className="space-y-4 p-8">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}

          {isConverting && (
            <div className="p-12 text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--brand-primary)]">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">
                Converting Document to Markdown…
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Extracting formatted text, tables, and sections using on-device document inspection.
              </p>
            </div>
          )}

          {conversionError && (
            <div className="m-6 rounded-panel border border-destructive/30 bg-destructive/10 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-destructive font-semibold">
                <AlertTriangle size={15} />
                <span>Conversion Error</span>
              </div>
              <p className="text-muted-foreground">{conversionError}</p>
              <Button size="sm" variant="outline" onClick={handleConvertDocument} className="gap-1.5 mt-2">
                <RefreshCw size={12} />
                <span>Retry Conversion</span>
              </Button>
            </div>
          )}

          {doc === null && !isConverting && !isConverted && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Document could not be loaded.
            </div>
          )}

          {/* Tiptap Markdown Editor / Viewer */}
          {(doc || isConverted) && isEditing && (
            <TiptapEditor
              key={relPath}
              initialContent={draftContent || doc?.content || ''}
              onChange={(newMd) => {
                setDraftContent(newMd);
                setIsDirty(newMd !== originalContentRef.current);
              }}
              onSave={handleSave}
            />
          )}

          {/* Rendered Preview Mode */}
          {(doc || isConverted) && !isEditing && (
            <article className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
              {/* Convertible Document Banner */}
              {isConvertible && !isConverted && (
                <div className="rounded-panel border border-[var(--brand-primary)]/20 bg-[var(--surface-tint)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <FileText size={15} className="text-[var(--brand-primary)]" />
                      <span>Non-Markdown Document Detected</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Convert this {doc?.type || 'file'} to clean Markdown for inline reading, editing, and note integration.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleConvertDocument}
                    disabled={isConverting}
                    className="gap-1.5 shrink-0"
                  >
                    <Sparkles size={13} />
                    <span>Convert Now</span>
                  </Button>
                </div>
              )}

              {/* YouTube Media Capture Rich Card */}
              {ytMeta && (
                <div className="rounded-panel border border-border bg-card p-5 space-y-4 shadow-xs">
                  {/* YouTube Header Info */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 text-[11px] font-bold">
                          <Video size={11} />
                          <span>YouTube Video</span>
                        </span>
                        {ytMeta.duration && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock size={11} />
                            <span>{ytMeta.duration}</span>
                          </span>
                        )}
                      </div>

                      <h3 className="font-semibold text-base text-foreground leading-snug">
                        {doc?.title || 'YouTube Media Capture'}
                      </h3>

                      {ytMeta.channel && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                          <User size={12} className="text-muted-foreground/80" />
                          <span className="font-medium text-foreground">{ytMeta.channel}</span>
                          {ytMeta.uploadDate && (
                            <>
                              <span>·</span>
                              <span>Published {ytMeta.uploadDate}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {ytMeta.url && (
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={ytMeta.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-control border border-border bg-[var(--surface-field)] px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-card hover:border-[var(--hairline-strong)] transition-all"
                        >
                          <Play size={12} className="text-red-600 fill-red-600" />
                          <span>Watch on YouTube</span>
                          <ExternalLink size={11} className="text-muted-foreground" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Uploader Chapters */}
                  {ytMeta.chapters && ytMeta.chapters.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-border/60">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <List size={13} className="text-[var(--brand-primary)]" />
                        <span>Uploader Chapters ({ytMeta.chapters.length})</span>
                      </h4>

                      <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                        {ytMeta.chapters.map((chap, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 rounded-control border border-border/50 bg-[var(--surface-field)] hover:bg-card transition-colors text-xs"
                          >
                            <span className="font-medium text-foreground truncate pr-2">
                              {chap.title}
                            </span>
                            {chap.time && (
                              <span className="font-mono text-[11px] text-muted-foreground shrink-0 rounded-full bg-card px-2 py-0.5 border border-border/40">
                                {chap.time}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uploader Description */}
                  {ytMeta.description && (
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileText size={13} className="text-[var(--brand-primary)]" />
                        <span>Uploader Description</span>
                      </h4>
                      <div className="rounded-control bg-[var(--surface-field)] p-3 text-xs text-foreground/90 font-normal leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-border/40 font-mono">
                        {ytMeta.description}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Frontmatter Metadata Block for Entities/Notes */}
              {!ytMeta && (() => {
                const fm = doc?.frontmatter || {};
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl border border-border/70 bg-muted/30 p-3.5 text-xs">
                    {metadataEntries.map(([label, value]) => (
                      <div key={label} className="flex items-baseline gap-2 min-w-0">
                        <span className="font-semibold text-muted-foreground shrink-0">{label}:</span>
                        <span className="font-medium text-foreground truncate">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Linked Meetings */}
              {doc?.linkedMeetings && doc.linkedMeetings.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calendar size={13} className="text-[var(--brand-primary)]" />
                    <span>Linked Meetings ({doc.linkedMeetings.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {doc.linkedMeetings.map((m) => (
                      <button
                        key={m.relPath}
                        onClick={() => {
                          window.dori?.call('get_document', { path: m.relPath }).then((loaded) => {
                            if (loaded) {
                              setDoc(loaded);
                              originalContentRef.current = loaded.content || '';
                              setDraftContent(loaded.content || '');
                            }
                          });
                        }}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-foreground block truncate group-hover:text-[var(--brand-primary)]">
                            {m.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground block truncate font-mono mt-0.5">
                            {m.relPath}
                          </span>
                        </div>
                        {m.date && (
                          <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                            {m.date.slice(0, 10)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Document Prose Content */}
              {doc?.html ? (
                <div
                  className="prose dark:prose-invert max-w-none text-[17px] leading-[1.8] font-normal prose-headings:font-semibold prose-headings:text-foreground prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-[17px] prose-p:leading-[1.8] prose-p:text-foreground prose-li:text-[17px] prose-strong:font-semibold prose-strong:text-foreground"
                  dangerouslySetInnerHTML={{ __html: doc.html }}
                />
              ) : isConverted || doc?.content ? (
                <TiptapEditor
                  key={`${relPath}-converted`}
                  initialContent={doc?.content || draftContent || ''}
                  editable={false}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  This document cannot be previewed natively. Use "Preview as Markdown" above to convert it.
                </div>
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
