import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  CheckCircle2,
  Circle,
  Home,
  ChevronRight,
  ChevronDown,
  Clock,
  Send,
  Plus,
  Users,
  Calendar,
  Layers,
  ExternalLink,
  MessageSquare,
  ListTodo,
  AlertCircle,
  Check,
  Sparkles,
  Info,
  ArrowRight,
} from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumbs.jsx';
import { EnginePicker } from './EnginePicker.jsx';
import { cn } from '../lib/utils.js';

function getFileIcon(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (ext === 'md') return <FileText size={15} className="text-amber-500" />;
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return <FileImage size={15} className="text-purple-500" />;
  if (['csv', 'xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={15} className="text-emerald-500" />;
  return <FileIcon size={15} className="text-sky-500" />;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ProjectView({
  projectPath,
  onSelectProject,
  onSelectDocument,
  onNavigateHome,
  onNavigateProjects,
}) {
  const [project, setProject] = useState(undefined);
  const [children, setChildren] = useState([]);
  const [details, setDetails] = useState({ files: [], meetings: [], people: [], tasks: [] });
  const [openTasks, setOpenTasks] = useState([]);
  const [contextDoc, setContextDoc] = useState(null);

  // Sub-projects dropdown state
  const [isSubProjectsOpen, setIsSubProjectsOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [isCreatingSub, setIsCreatingSub] = useState(false);
  const subDropdownRef = useRef(null);

  // Contextual composer state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [engine, setEngine] = useState('none');
  const [errorMessage, setErrorMessage] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setProject(undefined);
    setChildren([]);
    setContextDoc(null);
    setMessages([]);

    // 1. Fetch project list & hierarchy
    window.dori
      ?.call('list_projects', {})
      .then((all) => {
        const found = all?.find((p) => p.projectPath === projectPath);
        setProject(found || null);

        const subs = all?.filter(
          (p) =>
            p.projectPath !== projectPath &&
            p.projectPath.startsWith(`${projectPath}/`) &&
            !p.projectPath.slice(projectPath.length + 1).includes('/')
        );
        setChildren(subs || []);
      })
      .catch(() => setProject(null));

    // 2. Fetch project details (files, meetings, people, tasks)
    window.dori
      ?.call('get_project_details', { projectPath })
      .then((det) => {
        setDetails(det || { files: [], meetings: [], people: [], tasks: [] });
      })
      .catch(() => setDetails({ files: [], meetings: [], people: [], tasks: [] }));

    // 3. Fetch open tasks
    window.dori
      ?.call('list_tasks', { status: 'open' })
      .then((tasks) => {
        const projTasks = (tasks || []).filter(
          (t) =>
            t.project === projectPath ||
            (t.sourcePath && t.sourcePath.includes(projectPath)) ||
            (t.title && t.title.toLowerCase().includes(projectPath.toLowerCase()))
        );
        setOpenTasks(projTasks);
      })
      .catch(() => setOpenTasks([]));

    // 4. Fetch context document (README.md or project context)
    const contextCandidates = [
      `entities/projects/${projectPath}/README.md`,
      `projects/${projectPath}/README.md`,
      `entities/projects/${projectPath}/context.md`,
    ];

    const tryFetchContext = async () => {
      for (const cand of contextCandidates) {
        try {
          const doc = await window.dori?.call('get_document', { relPath: cand });
          if (doc?.content) {
            setContextDoc({ path: cand, ...doc });
            break;
          }
        } catch {}
      }
    };
    tryFetchContext();

    // 5. Engine config
    window.dori
      ?.call('get_engine_config', {})
      .then((cfg) => setEngine(cfg?.replyCli || 'none'))
      .catch(() => setEngine('none'));
  }, [projectPath]);

  // Click outside sub-projects dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (subDropdownRef.current && !subDropdownRef.current.contains(e.target)) {
        setIsSubProjectsOpen(false);
      }
    };
    if (isSubProjectsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isSubProjectsOpen]);

  const handleToggleTask = async (taskId) => {
    try {
      await window.dori?.call('mark_task_done', { id: taskId });
      setOpenTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      window.alert(`Failed to complete task: ${err.message}`);
    }
  };

  const handleCreateSubProject = async (e) => {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    setIsCreatingSub(true);
    const newSlug = `${projectPath}/${quickAddName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    try {
      await window.dori?.call('apply_template', {
        template: 'client',
        project: newSlug,
      });
      setQuickAddName('');
      setIsSubProjectsOpen(false);
      onSelectProject?.(newSlug);
    } catch (err) {
      window.alert(`Failed to create sub-project: ${err.message}`);
    } finally {
      setIsCreatingSub(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setInput('');
    setErrorMessage(null);

    const newHistory = [...messages, { role: 'user', text: userText }];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      const res = await window.dori?.call('chat_send', {
        message: userText,
        history: messages,
        projectContext: projectPath,
      });
      setMessages([...newHistory, { role: 'dori', text: res?.reply || 'Done.' }]);
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  // Build merged chronological activity feed
  const activityTimeline = useMemo(() => {
    const events = [];
    (details.files || []).forEach((f) => {
      events.push({
        id: `file-${f.relPath}`,
        type: 'file',
        title: f.title || f.name || f.relPath.split('/').pop(),
        date: f.date || 'Recent',
        relPath: f.relPath,
      });
    });
    (details.meetings || []).forEach((m) => {
      events.push({
        id: `meeting-${m.relPath || m.title}`,
        type: 'meeting',
        title: m.title,
        date: m.date || 'Recent',
        relPath: m.relPath,
        attendees: m.attendees,
      });
    });
    return events.slice(0, 10);
  }, [details]);

  const breadcrumbSegments = useMemo(() => {
    const parts = projectPath.split('/');
    let cumulative = '';
    return parts.map((seg, i) => {
      cumulative = cumulative ? `${cumulative}/${seg}` : seg;
      return {
        name: seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        path: cumulative,
        isLast: i === parts.length - 1,
      };
    });
  }, [projectPath]);

  if (project === undefined) {
    return (
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (project === null) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Project Not Found"
        description={`No project configuration found matching "${projectPath}".`}
        actionLabel="Back to Projects"
        onAction={onNavigateProjects}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-canvas)] text-foreground">
      {/* Scrollable Dashboard Body */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl w-full mx-auto">
        {/* Header Breadcrumbs & Actions */}
        <header className="space-y-3 pb-4 border-b border-border">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={onNavigateProjects} className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Projects
                </BreadcrumbLink>
              </BreadcrumbItem>
              {breadcrumbSegments.map((seg) => (
                <div key={seg.path} className="flex items-center gap-1.5">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {seg.isLast ? (
                      <BreadcrumbPage className="font-semibold text-foreground">{seg.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink onClick={() => onSelectProject(seg.path)} className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {seg.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </div>
              ))}
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {project.title}
                </h1>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20 text-xs font-semibold px-2 py-0.5">
                  Active
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {details.files?.length || 0} files · {details.meetings?.length || 0} meetings · {openTasks.length} open loops
              </p>
            </div>

            {/* Sub-projects Dropdown Chip */}
            <div ref={subDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsSubProjectsOpen(!isSubProjectsOpen)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer shadow-xs"
              >
                <Layers size={13} className="text-amber-500" />
                <span>Sub-projects ({children.length})</span>
                <ChevronDown size={12} className={cn('transition-transform duration-150 text-muted-foreground', isSubProjectsOpen && 'rotate-180')} />
              </button>

              {isSubProjectsOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-2xl z-30 anim-rise space-y-1">
                  {children.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground italic">No sub-projects yet</div>
                  ) : (
                    children.map((child) => (
                      <button
                        key={child.projectPath}
                        onClick={() => {
                          setIsSubProjectsOpen(false);
                          onSelectProject(child.projectPath);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <span className="truncate">{child.title}</span>
                        <ChevronRight size={12} className="text-muted-foreground" />
                      </button>
                    ))
                  )}

                  {/* Inline Quick Add */}
                  <form onSubmit={handleCreateSubProject} className="pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="+ Quick add sub-project..."
                        value={quickAddName}
                        onChange={(e) => setQuickAddName(e.target.value)}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                      />
                      <button
                        type="submit"
                        disabled={!quickAddName.trim() || isCreatingSub}
                        className="h-6 px-2 rounded bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-semibold transition-colors disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 1. Context Summary Card */}
        {contextDoc && (
          <div
            onClick={() => onSelectDocument(contextDoc.path)}
            className="group flex items-center justify-between p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] hover:border-amber-500/35 transition-all cursor-pointer shadow-xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 mt-0.5">
                <Info size={15} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Project Context</span>
                  <span className="text-[11px] text-muted-foreground">({contextDoc.path})</span>
                </div>
                <p className="mt-1 text-xs text-foreground-secondary line-clamp-2 leading-relaxed">
                  {contextDoc.content.replace(/^#+.*$/gm, '').trim().slice(0, 180)}...
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-4" />
          </div>
        )}

        {/* 2-Column Cockpit Layout: Open Loops + Activity Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Open Loops (Tasks) */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-xs text-foreground uppercase tracking-wider">
                <ListTodo size={14} className="text-emerald-500" />
                <span>Open Loops ({openTasks.length})</span>
              </div>
            </div>

            {openTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground italic">
                No open tasks for this project
              </div>
            ) : (
              <div className="space-y-2">
                {openTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTask(task.id)}
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border hover:border-emerald-500 hover:bg-emerald-500/20 text-transparent hover:text-emerald-500 transition-colors"
                    >
                      <Check size={10} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground leading-tight">{task.title}</p>
                      {task.dueDate && (
                        <p className="mt-0.5 text-[11px] text-amber-500">Due {task.dueDate}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Activity Feed (Files & Meetings) */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-xs text-foreground uppercase tracking-wider">
                <Clock size={14} className="text-sky-500" />
                <span>Activity Timeline</span>
              </div>
            </div>

            {activityTimeline.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground italic">
                No activity recorded yet
              </div>
            ) : (
              <div className="space-y-1.5">
                {activityTimeline.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => item.relPath && onSelectDocument(item.relPath)}
                    className="flex w-full items-center justify-between gap-3 p-2 rounded-lg text-left hover:bg-muted transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0">{getFileIcon(item.relPath)}</span>
                      <span className="truncate text-xs font-medium text-foreground group-hover:text-amber-500">
                        {item.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                      {formatRelativeTime(item.date)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. Scoped Project Chat & Actions */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2 font-semibold text-xs text-foreground uppercase tracking-wider">
              <MessageSquare size={14} className="text-amber-500" />
              <span>Project Assistant & Notes</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Engine: <span className="text-amber-500 font-semibold">{engine}</span>
            </div>
          </div>

          {/* Chat History Snippets */}
          {messages.length > 0 && (
            <div className="space-y-3 max-h-60 overflow-y-auto p-2 bg-muted/30 rounded-lg border border-border">
              {messages.map((m, i) => (
                <div key={i} className={cn('text-xs leading-relaxed', m.role === 'user' ? 'text-amber-600 dark:text-amber-300' : 'text-foreground')}>
                  <span className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground mr-1.5">
                    {m.role === 'user' ? 'You' : 'Dori'}:
                  </span>
                  {m.text}
                </div>
              ))}
            </div>
          )}

          {/* Chat Input */}
          <div className="flex items-center gap-2">
            <input
              ref={textareaRef}
              type="text"
              placeholder={`Ask Dori about ${project.title} or add an update...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
            />
            <Button
              size="sm"
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="h-8 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs px-3"
            >
              {isLoading ? <Clock size={12} className="animate-spin" /> : <Send size={12} />}
            </Button>
          </div>
          {errorMessage && (
            <p className="text-xs text-red-500">{errorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
