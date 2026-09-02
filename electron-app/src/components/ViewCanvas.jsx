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
  MessageSquare,
  CheckSquare,
  ArrowLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { cn } from '../lib/utils.js';

const WIDTH_STORAGE_KEY = 'dori-view-canvas-width-v6';
const MIN_WIDTH = 480;
const MAX_WIDTH = 1300;
const DEFAULT_WIDTH = 620;

const CONVERTIBLE_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.epub', '.rtf', '.odt'];

function isConvertibleDocument(relPath, doc) {
  if (!relPath && !doc) return false;
  const target = (relPath || doc?.relPath || '').toLowerCase();
  const hasExt = CONVERTIBLE_EXTENSIONS.some((ext) => target.endsWith(ext));
  const hasType = ['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'document'].includes(doc?.type?.toLowerCase());
  return hasExt || hasType;
}

function extractMeetingDocParts(content, doc, relPath) {
  if (!content) return { isMeeting: false, mom: '', transcript: '', hasMom: false, hasTranscript: false };

  const isMeeting =
    doc?.type === 'meeting' ||
    doc?.frontmatter?.type === 'meeting' ||
    (relPath || '').includes('/meetings/') ||
    (relPath || '').startsWith('meetings/') ||
    content.includes('## Transcript') ||
    content.includes('# Transcript');

  if (!isMeeting) return { isMeeting: false, mom: content, transcript: '', hasMom: true, hasTranscript: false };

  const transcriptMatch = content.search(/(?:^|\n)#{1,3}\s+Transcript/i);
  if (transcriptMatch === -1) {
    const lines = content.split('\n').filter((l) => l.trim());
    const dialogueLines = lines.filter((l) => /^[A-Z][a-zA-Z\s.'-]{1,30}\s*:\s*.+/.test(l));
    if (dialogueLines.length > 5 && dialogueLines.length / lines.length > 0.4) {
      return { isMeeting: true, mom: '', transcript: content, hasMom: false, hasTranscript: true };
    }
    return { isMeeting: true, mom: content, transcript: '', hasMom: true, hasTranscript: false };
  }

  const mom = content.slice(0, transcriptMatch).trim();
  const transcript = content.slice(transcriptMatch).trim();

  const momLines = mom.split('\n').filter((l) => {
    const t = l.trim();
    return (
      t &&
      !t.startsWith('#') &&
      !t.startsWith('**Date:**') &&
      !t.startsWith('**Attendees:**') &&
      !t.startsWith('**Duration:**') &&
      !t.startsWith('Date:') &&
      !t.startsWith('Attendees:')
    );
  });
  const hasMom = momLines.length > 0;

  return { isMeeting: true, mom, transcript, hasMom, hasTranscript: true };
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

  let videoId = null;
  const url = fm.url || '';
  const vMatch = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^&#?]+)/);
  if (vMatch) videoId = vMatch[1];

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
    const chapSection = doc.content.match(/##\s*Chapters\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
    if (chapSection) {
      const lines = chapSection[1].split('\n').filter(Boolean);
      for (const line of lines) {
        const m = line.match(/(?:-\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s+[-—–]?\s*(.+)/);
        if (m) chapters.push({ time: m[1], title: m[2].trim() });
      }
    }
  }

  let description = fm.description || '';
  if (!description && doc?.content) {
    const descSection = doc.content.match(/##\s*Description\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
    if (descSection) description = descSection[1].trim();
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

export function ViewCanvas({
  relPath,
  onClose,
  onOpenDocument,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meetingTab, setMeetingTab] = useState('mom');
  const [isMaximized, setIsMaximized] = useState(false);
  const [textSize, setTextSize] = useState('normal'); // 'compact' | 'normal' | 'large'
  const [history, setHistory] = useState([]);

  // Resizable Canvas Width (persisted to localStorage)
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(WIDTH_STORAGE_KEY);
      return saved ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved, 10))) : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const [isDragging, setIsDragging] = useState(false);

  // Conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [convertResult, setConvertResult] = useState(null);
  const [convertError, setConvertError] = useState(null);

  // Document Editor
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: '',
    editable: isEditing,
  });

  // Track document history navigation
  useEffect(() => {
    if (relPath) {
      setHistory((prev) => {
        if (prev[prev.length - 1] === relPath) return prev;
        return [...prev.filter((p) => p !== relPath), relPath];
      });
    }
  }, [relPath]);

  const handleBack = () => {
    if (history.length > 1) {
      const newHist = [...history];
      newHist.pop(); // remove current
      const prevDoc = newHist[newHist.length - 1];
      setHistory(newHist);
      onOpenDocument?.(prevDoc);
    }
  };

  const fetchDoc = useCallback(async (path) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    setConvertResult(null);
    setConvertError(null);
    try {
      const res = await window.dori?.call('get_document', { relPath: path });
      setDoc(res);
      if (editor && res?.content) {
        editor.commands.setContent(res.content);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [editor]);

  useEffect(() => {
    if (relPath) {
      fetchDoc(relPath);
      setIsEditing(false);
    }
  }, [relPath, fetchDoc]);

  // Drag resizing
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setWidth(newWidth);
        try {
          localStorage.setItem(WIDTH_STORAGE_KEY, String(newWidth));
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleResetWidth = () => {
    const resetW = Math.round(window.innerWidth * 0.48);
    setWidth(resetW);
    localStorage.setItem(WIDTH_STORAGE_KEY, String(resetW));
  };

  const handleSave = async () => {
    if (!editor || !relPath) return;
    setIsSaving(true);
    try {
      const content = editor.storage.markdown.getMarkdown();
      await window.dori?.call('save_document', { path: relPath, content });
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      fetchDoc(relPath);
    } catch (err) {
      window.alert(`Failed to save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    if (!relPath) return;
    navigator.clipboard.writeText(relPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleConvert = async () => {
    if (!relPath) return;
    setIsConverting(true);
    setConvertError(null);
    try {
      const res = await window.dori?.call('convert_document', { filePath: relPath });
      setConvertResult(res);
      fetchDoc(relPath);
    } catch (err) {
      setConvertError(err?.message || 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  const meetingParts = useMemo(() => {
    return extractMeetingDocParts(doc?.content, doc, relPath);
  }, [doc, relPath]);

  const ytMeta = useMemo(() => {
    return extractYoutubeMetadata(doc, relPath);
  }, [doc, relPath]);

  const convertible = useMemo(() => {
    return isConvertibleDocument(relPath, doc);
  }, [relPath, doc]);

  if (!relPath) return null;

  return (
    <aside
      style={{ width: isMaximized ? '100%' : `${width}px` }}
      className={cn(
        'relative flex h-full flex-col border-l border-white/[0.08] bg-[var(--surface-canvas)] text-[var(--foreground)] transition-[width] duration-150 ease-out z-20 shrink-0',
        isDragging && 'select-none transition-none'
      )}
    >
      {/* Draggable Split Separator Handle */}
      {!isMaximized && (
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleResetWidth}
          title="Drag to resize canvas (Double click to reset)"
          className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 hover:bg-amber-500/30 group flex items-center justify-center transition-colors"
        >
          <div className="w-[2px] h-12 rounded-full bg-white/20 group-hover:bg-amber-500 transition-colors" />
        </div>
      )}

      {/* Document Reader Toolbar */}
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4 bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          {history.length > 1 && (
            <button
              onClick={handleBack}
              title="Back to previous document"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
          )}

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.06] text-white/70">
              {ytMeta ? <Video size={12} className="text-red-400" /> : <FileText size={12} className="text-amber-400" />}
            </span>
            <span className="truncate text-[13px] font-medium text-white/90" title={doc?.title || relPath}>
              {doc?.title || relPath.split('/').pop()}
            </span>
          </div>
        </div>

        {/* Reader Actions */}
        <div className="flex items-center gap-1">
          {/* Text Size Scale */}
          <div className="flex items-center rounded-md bg-white/[0.04] p-0.5 border border-white/[0.06] mr-1">
            <button
              onClick={() => setTextSize((s) => (s === 'large' ? 'normal' : 'compact'))}
              title="Smaller font size"
              className={cn(
                'px-1.5 py-0.5 text-[11px] rounded font-medium transition-colors',
                textSize === 'compact' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
              )}
            >
              A-
            </button>
            <button
              onClick={() => setTextSize((s) => (s === 'compact' ? 'normal' : 'large'))}
              title="Larger font size"
              className={cn(
                'px-1.5 py-0.5 text-[11px] rounded font-medium transition-colors',
                textSize === 'large' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
              )}
            >
              A+
            </button>
          </div>

          {/* Copy Link */}
          <button
            onClick={handleCopy}
            title={copied ? 'Copied relative path!' : 'Copy path'}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          {/* Edit / View Toggle */}
          {!convertible && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              title={isEditing ? 'Preview Markdown' : 'Edit Document'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors',
                isEditing ? 'bg-amber-500/20 text-amber-400' : 'text-white/60 hover:bg-white/[0.08] hover:text-white'
              )}
            >
              {isEditing ? <Eye size={13} /> : <Edit3 size={13} />}
            </button>
          )}

          {/* Maximize Toggle */}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Restore Split View' : 'Maximize Workspace'}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Close Canvas */}
          <button
            onClick={onClose}
            title="Close Canvas (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* Meeting Segmented Tabs */}
      {meetingParts.isMeeting && meetingParts.hasTranscript && (
        <div className="flex border-b border-white/[0.08] bg-white/[0.01] px-4 py-2">
          <div className="inline-flex rounded-lg bg-black/40 p-1 border border-white/[0.08] text-[12px]">
            <button
              onClick={() => setMeetingTab('mom')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all',
                meetingTab === 'mom'
                  ? 'bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <Sparkles size={12} className={meetingTab === 'mom' ? 'text-amber-400' : ''} />
              <span>Minutes of Meeting (MOM)</span>
            </button>
            <button
              onClick={() => setMeetingTab('transcript')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all',
                meetingTab === 'transcript'
                  ? 'bg-white/15 text-white shadow-sm border border-white/20'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <List size={12} />
              <span>Full Transcript</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Canvas Body */}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-6 leading-relaxed',
          textSize === 'compact' && 'text-[13px]',
          textSize === 'normal' && 'text-[15px]',
          textSize === 'large' && 'text-[17px]'
        )}
      >
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4 bg-white/5" />
            <Skeleton className="h-4 w-1/2 bg-white/5" />
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-full bg-white/5" />
              <Skeleton className="h-4 w-5/6 bg-white/5" />
              <Skeleton className="h-4 w-4/6 bg-white/5" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle size={16} />
              <span>Failed to load document</span>
            </div>
            <p className="mt-1 text-xs opacity-80">{error}</p>
          </div>
        ) : isEditing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Markdown Editor</span>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-7 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs"
              >
                {isSaving ? <RefreshCw size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
                Save Changes
              </Button>
            </div>
            <EditorContent
              editor={editor}
              className="prose prose-invert max-w-none focus:outline-none min-h-[400px] font-mono text-[13px] bg-black/20 p-4 rounded-xl border border-white/[0.08]"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Frontmatter Metadata Pill Header */}
            {doc?.frontmatter && Object.keys(doc.frontmatter).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-white/[0.08]">
                {doc.frontmatter.date && (
                  <Badge variant="outline" className="flex items-center gap-1 bg-white/[0.03] text-xs font-medium border-white/10">
                    <Calendar size={11} className="text-amber-400" />
                    <span>{doc.frontmatter.date}</span>
                  </Badge>
                )}
                {doc.frontmatter.type && (
                  <Badge variant="outline" className="bg-white/[0.03] text-xs font-medium border-white/10 uppercase tracking-wider text-white/70">
                    {doc.frontmatter.type}
                  </Badge>
                )}
                {doc.frontmatter.project && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-300 text-xs font-medium border-amber-500/20">
                    {doc.frontmatter.project}
                  </Badge>
                )}
              </div>
            )}

            {/* Document Content View */}
            {meetingParts.isMeeting ? (
              meetingTab === 'mom' ? (
                <div
                  className="prose prose-invert max-w-none prose-headings:font-semibold prose-a:text-amber-400"
                  dangerouslySetInnerHTML={{
                    __html: doc?.renderedHtml || doc?.content || '',
                  }}
                />
              ) : (
                <div className="space-y-4 font-mono text-[13px] leading-relaxed bg-black/20 p-4 rounded-xl border border-white/[0.08]">
                  <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Verbatim Transcript</div>
                  {meetingParts.transcript.split('\n\n').map((para, i) => {
                    const match = para.match(/^(\*\*[^*]+\*\*)\s*:\s*(.*)/);
                    if (match) {
                      return (
                        <div key={i} className="space-y-0.5">
                          <span className="text-amber-400 font-bold">{match[1].replace(/\*\*/g, '')}:</span>
                          <span className="text-white/80 ml-2">{match[2]}</span>
                        </div>
                      );
                    }
                    return <p key={i} className="text-white/70">{para}</p>;
                  })}
                </div>
              )
            ) : ytMeta ? (
              <div className="space-y-6">
                {ytMeta.videoId && (
                  <div className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-black">
                    <iframe
                      src={`https://www.youtube.com/embed/${ytMeta.videoId}`}
                      title={doc?.title || 'YouTube Video'}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
                <div
                  className="prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: doc?.renderedHtml || doc?.content || '' }}
                />
              </div>
            ) : (
              <div
                className="prose prose-invert max-w-none prose-headings:font-semibold prose-a:text-amber-400"
                dangerouslySetInnerHTML={{
                  __html: doc?.renderedHtml || doc?.content || '',
                }}
              />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
