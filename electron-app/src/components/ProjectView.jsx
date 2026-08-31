import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FolderX,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  CheckCircle2,
  Circle,
  Home,
  ChevronRight,
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
} from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs.jsx';
import {
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
} from './ui/attachment.jsx';
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

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const SPREADSHEET_EXTS = new Set(['csv', 'xls', 'xlsx']);

function getFileIcon(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (ext === 'md') return <FileText size={18} className="text-blue-500" />;
  if (IMAGE_EXTS.has(ext)) return <FileImage size={18} className="text-purple-500" />;
  if (SPREADSHEET_EXTS.has(ext)) return <FileSpreadsheet size={18} className="text-emerald-500" />;
  return <FileIcon size={18} className="text-amber-500" />;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderBriefHighlights(rawContent) {
  if (!rawContent) return { items: [], summary: '' };
  const lines = rawContent.split('\n');
  const items = [];
  let summary = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('**') && trimmed.includes(':**')) {
      const match = trimmed.match(/^\*\*(.+?):\*\*\s*(.+)$/);
      if (match) {
        items.push({ label: match[1], value: match[2] });
      }
    } else if (trimmed.startsWith('- `') || (trimmed.startsWith('- ') && !trimmed.startsWith('---'))) {
      const text = trimmed.replace(/^-\s*/, '');
      if (text) items.push({ label: 'Key Ref', value: text });
    } else if (!trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('**') && trimmed.length > 25 && !summary) {
      summary = trimmed;
    }
  }

  return { items, summary };
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
  const [details, setDetails] = useState({ files: [], meetings: [], people: [] });
  const [allTasks, setAllTasks] = useState([]);
  const [contextDoc, setContextDoc] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Inline contextual composer state
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

    // 1. Fetch project list & sub-projects
    window.dori
      ?.call('list_projects', {})
      .then((list) => {
        const found = list.find((p) => p.projectPath === projectPath) || null;
        setProject(found);
        setChildren(
          list.filter(
            (p) =>
              p.projectPath.startsWith(`${projectPath}/`) &&
              !p.projectPath.slice(projectPath.length + 1).includes('/')
          )
        );
      })
      .catch(() => setProject(null));

    // 2. Fetch full project details (linked files, meetings, people)
    window.dori
      ?.call('get_project_details', { projectPath })
      .then((data) => setDetails(data || { files: [], meetings: [], people: [] }))
      .catch(() => setDetails({ files: [], meetings: [], people: [] }));

    // 3. Fetch all tasks
    window.dori
      ?.call('list_tasks', { status: 'all' })
      .then((tasks) => setAllTasks(tasks || []))
      .catch(() => setAllTasks([]));

    // 4. Fetch engine config
    window.dori
      ?.call('get_engine_config', {})
      .then((cfg) => {
        if (cfg?.replyCli) setEngine(cfg.replyCli);
      })
      .catch(() => {});
  }, [projectPath]);

  // Load project context document
  useEffect(() => {
    if (!details.files || details.files.length === 0) return;
    const candidates = ['.setup.md', 'context.md', 'project.md', 'README.md', 'brief.md'];
    const found =
      details.files.find((f) => candidates.includes(f.name)) ||
      details.files.find((f) => f.name.endsWith('.md'));

    if (found) {
      window.dori
        ?.call('get_document', { path: found.relPath })
        .then(setContextDoc)
        .catch(() => {});
    }
  }, [details.files]);

  // Filter tasks belonging to this project from details.tasks and allTasks
  const projectTasks = useMemo(() => {
    const map = new Map();
    if (Array.isArray(details.tasks)) {
      for (const t of details.tasks) {
        map.set(t.id, t);
      }
    }
    const prefix = `projects/${projectPath}`;
    for (const t of allTasks) {
      if (t.relPath?.startsWith(prefix) || t.projectPath === projectPath) {
        if (!map.has(t.id)) {
          map.set(t.id, t);
        }
      }
    }
    return Array.from(map.values());
  }, [details.tasks, allTasks, projectPath]);

  // Group tasks by attributed person
  const tasksByPerson = useMemo(() => {
    const groups = new Map();
    for (const t of projectTasks) {
      const personName = t.person || 'Unassigned';
      if (!groups.has(personName)) {
        groups.set(personName, []);
      }
      groups.get(personName).push(t);
    }
    return Array.from(groups.entries()).map(([person, tasks]) => ({
      person,
      tasks,
    }));
  }, [projectTasks]);

  // Handle task status toggle
  const handleToggleTask = async (taskId) => {
    try {
      await window.dori?.call('mark_task_done', { id: taskId });
      setDetails((prev) => ({
        ...prev,
        tasks: (prev.tasks || []).map((t) =>
          t.id === taskId ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t
        ),
      }));
      setAllTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t
        )
      );
    } catch (e) {
      console.error('Failed to toggle task:', e);
    }
  };

  // Handle send message from project composer
  const handleSendText = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (engine === 'none') {
      setErrorMessage('AI is not configured. Please select Claude Code or Codex in the picker.');
      return;
    }

    const userTurn = { role: 'user', text, timestamp: new Date().toISOString() };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setInput('');
    setIsLoading(true);
    setErrorMessage(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await window.dori.call('chat_send', {
        message: text,
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        projectContext: projectPath,
      });

      const doriTurn = {
        role: 'dori',
        text: response.reply,
        timestamp: response.timestamp || new Date().toISOString(),
      };
      setMessages([...nextHistory, doriTurn]);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to get a reply from the CLI.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // Breadcrumbs
  const pathSegments = projectPath?.split('/') || [];
  const openTaskCount = projectTasks.filter((t) => t.status === 'open').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
      <div className="flex-1 overflow-y-auto">
        <div className="page-frame space-y-6 pb-28">
          {/* Skeleton Loading */}
          {project === undefined && (
            <div className="flex items-start gap-4 p-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            </div>
          )}

          {project && (
            <>
              {/* Breadcrumb Navigation Trail */}
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink onClick={onNavigateHome}>
                      <Home size={13} className="mr-1" />
                      Home
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink onClick={onNavigateProjects}>
                      Projects
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {pathSegments.map((segment, idx) => {
                    const isLast = idx === pathSegments.length - 1;
                    const cumulativePath = pathSegments.slice(0, idx + 1).join('/');
                    return (
                      <span key={cumulativePath} className="inline-flex items-center gap-1.5 sm:gap-2">
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{project.title}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink onClick={() => onSelectProject?.(cumulativePath)}>
                              {segment}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </span>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>

              {/* Route Header */}
              <RouteHeader
                title={project.title}
                description={
                  <span className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                    <span className="font-mono">projects/{projectPath}</span>
                    <span>·</span>
                    <span>{details.files.length} file{details.files.length === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{details.meetings.length} meeting{details.meetings.length === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{openTaskCount} open loop{openTaskCount === 1 ? '' : 's'}</span>
                    {details.people.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{details.people.length} person{details.people.length === 1 ? '' : 's'}</span>
                      </>
                    )}
                  </span>
                }
                meta={
                  <Badge variant="muted" size="compact">
                    {project.status || 'Active'}
                  </Badge>
                }
              />

              {/* Sub-projects Row (if any) */}
              {children.length > 0 && (
                <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-4 shadow-2xs">
                  <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Layers size={14} />
                    <span>Sub-projects ({children.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {children.map((c) => (
                      <button
                        key={c.projectPath}
                        onClick={() => onSelectProject?.(c.projectPath)}
                        className="flex items-center gap-2.5 rounded-control border border-[var(--space-sidebar-border)] bg-[var(--surface-field)] p-2.5 text-left transition-all hover:border-[var(--hairline-strong)] hover:bg-card hover:shadow-2xs"
                      >
                        <Folder size={17} className="text-[var(--brand-accent)] shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {c.title}
                        </span>
                        <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabs for Overview, Files, Meetings, People, Tasks */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-fit">
                  <TabsTrigger value="overview" className="gap-2">
                    <FileText size={15} />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="files" className="gap-2">
                    <FolderOpen size={15} />
                    Files ({details.files.length})
                  </TabsTrigger>
                  <TabsTrigger value="meetings" className="gap-2">
                    <Calendar size={15} />
                    Meetings ({details.meetings.length})
                  </TabsTrigger>
                  <TabsTrigger value="people" className="gap-2">
                    <Users size={15} />
                    People ({details.people.length})
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="gap-2">
                    <ListTodo size={15} />
                    Tasks ({openTaskCount})
                  </TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="space-y-6 mt-2">
                  {/* Context Brief Preview Card */}
                  {contextDoc && (
                    <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] pb-3 mb-3.5">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-[var(--brand-primary)]" />
                          <h3 className="text-sm font-semibold text-foreground">
                            {contextDoc.title || 'Project Overview & Brief'}
                          </h3>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onSelectDocument?.(contextDoc.relPath)}
                          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2.5 gap-1.5"
                        >
                          <span>Open Document</span>
                          <ExternalLink size={12} />
                        </Button>
                      </div>

                      {(() => {
                        const { items, summary } = renderBriefHighlights(contextDoc.content);
                        return (
                          <div className="space-y-3">
                            {items.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                {items.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-baseline gap-2 rounded-lg bg-[var(--surface-field)] px-3 py-2 border border-[var(--space-sidebar-border)]"
                                  >
                                    <span className="font-semibold text-muted-foreground shrink-0">
                                      {item.label}:
                                    </span>
                                    <span className="font-medium text-foreground truncate">
                                      {item.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {summary && (
                              <p className="text-sm text-foreground-secondary leading-relaxed font-normal pt-1">
                                {summary}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Linked People Section */}
                  {details.people.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
                          <Users size={16} className="text-[var(--brand-primary)]" />
                          <span>Linked People ({details.people.length})</span>
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {details.people.map((person) => {
                          const initials = person.name
                            .split(/\s+/)
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase();
                          return (
                            <div
                              key={person.relPath}
                              onClick={() => onSelectDocument?.(person.relPath)}
                              className="flex items-center gap-3 rounded-panel border border-[var(--space-sidebar-border)] bg-card p-3 shadow-2xs hover:border-[var(--hairline-strong)] transition-all cursor-pointer"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-bold text-white shadow-2xs">
                                {initials}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-semibold text-foreground truncate">
                                  {person.name}
                                </h4>
                                <p className="text-xs text-muted-foreground truncate">
                                  {person.role || person.org || 'Linked entity'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Linked Meetings Section */}
                  {details.meetings.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
                          <Calendar size={16} className="text-[var(--brand-primary)]" />
                          <span>Linked Meetings ({details.meetings.length})</span>
                        </h3>
                        {details.meetings.length > 3 && (
                          <button
                            onClick={() => setActiveTab('meetings')}
                            className="text-xs font-semibold text-[var(--brand-primary)] hover:underline"
                          >
                            View all →
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {details.meetings.slice(0, 3).map((meeting) => (
                          <div
                            key={meeting.relPath}
                            onClick={() => onSelectDocument?.(meeting.relPath)}
                            className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-4 shadow-2xs hover:border-[var(--hairline-strong)] transition-all cursor-pointer space-y-2"
                          >
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar size={13} />
                              <span>{formatDate(meeting.date)}</span>
                            </div>
                            <h4 className="text-sm font-semibold text-foreground line-clamp-2">
                              {meeting.title}
                            </h4>
                            {meeting.attendees?.length > 0 && (
                              <p className="text-xs text-muted-foreground truncate">
                                Attendees: {meeting.attendees.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Project Files Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[15px] font-semibold text-foreground">
                        Project Files ({details.files.length})
                      </h3>
                      {details.files.length > 6 && (
                        <button
                          onClick={() => setActiveTab('files')}
                          className="text-xs font-semibold text-[var(--brand-primary)] hover:underline"
                        >
                          View all {details.files.length} files →
                        </button>
                      )}
                    </div>

                    {details.files.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-1">
                        No files recorded under projects/{projectPath}/ yet.
                      </p>
                    ) : (
                      <AttachmentGroup>
                        {details.files.slice(0, 6).map((file) => (
                          <Attachment
                            key={file.relPath}
                            onClick={() => onSelectDocument?.(file.relPath)}
                            className="cursor-pointer"
                          >
                            <AttachmentMedia>
                              {getFileIcon(file.name)}
                            </AttachmentMedia>
                            <AttachmentContent>
                              <AttachmentTitle>{file.name}</AttachmentTitle>
                              <AttachmentDescription>
                                {formatDate(file.date)}
                              </AttachmentDescription>
                            </AttachmentContent>
                          </Attachment>
                        ))}
                      </AttachmentGroup>
                    )}
                  </div>

                  {/* Open Tasks Section */}
                  {projectTasks.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-[15px] font-semibold text-foreground">
                        Open Loops & Actions ({openTaskCount})
                      </h3>
                      <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card overflow-hidden shadow-2xs divide-y divide-[var(--space-sidebar-border)]">
                        {projectTasks.slice(0, 5).map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--space-nav-hover)] transition-colors"
                          >
                            <button
                              onClick={() => handleToggleTask(task.id)}
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {task.status === 'done' ? (
                                <CheckCircle2 size={18} className="text-emerald-500" />
                              ) : (
                                <Circle size={18} />
                              )}
                            </button>
                            <span
                              className={cn(
                                'text-sm flex-1 truncate text-foreground',
                                task.status === 'done' && 'line-through text-muted-foreground'
                              )}
                            >
                              {task.title}
                            </span>
                            {task.priority && (
                              <Badge
                                size="compact"
                                variant={task.priority.toLowerCase() === 'high' ? 'danger' : 'muted'}
                              >
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Conversation Stream if messages exist */}
                  {messages.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-[var(--space-sidebar-border)]">
                      <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare size={16} className="text-[var(--brand-primary)]" />
                        <span>Project Notes & Thread</span>
                      </h3>
                      <div className="space-y-4">
                        {messages.map((m, idx) => (
                          <div
                            key={idx}
                            className={cn('flex flex-col anim-rise', m.role === 'user' ? 'items-end' : 'items-start')}
                          >
                            <span className="text-xs font-semibold text-muted-foreground mb-1 px-1 uppercase tracking-wider">
                              {m.role === 'user' ? 'You' : 'Dori'}
                            </span>
                            <div
                              className={cn(
                                'rounded-2xl text-[15px] leading-relaxed',
                                m.role === 'user'
                                  ? 'max-w-xl bg-primary text-primary-foreground px-4.5 py-3 rounded-tr-sm shadow-xs'
                                  : 'w-full max-w-2xl bg-card border border-[var(--border-soft)] px-5 py-4 rounded-tl-sm shadow-xs prose dark:prose-invert text-foreground'
                              )}
                            >
                              {m.text}
                            </div>
                          </div>
                        ))}

                        {isLoading && (
                          <div className="flex items-start flex-col anim-rise">
                            <span className="text-xs font-semibold text-muted-foreground mb-1 px-1 uppercase tracking-wider">
                              Dori
                            </span>
                            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-card border border-[var(--border-soft)] px-4 py-3 text-sm text-muted-foreground shadow-xs">
                              <div className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.15s]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.3s]" />
                              </div>
                              <span className="ml-1 font-medium text-xs">Thinking…</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* FILES TAB */}
                <TabsContent value="files" className="space-y-4 mt-2">
                  {details.files.length === 0 ? (
                    <EmptyState
                      icon={FolderX}
                      title="No files yet"
                      description={`Add files to projects/${projectPath} in your vault to view them here.`}
                    />
                  ) : (
                    <AttachmentGroup>
                      {details.files.map((file) => (
                        <Attachment
                          key={file.relPath}
                          onClick={() => onSelectDocument?.(file.relPath)}
                          className="cursor-pointer"
                        >
                          <AttachmentMedia>
                            {getFileIcon(file.name)}
                          </AttachmentMedia>
                          <AttachmentContent>
                            <AttachmentTitle>{file.name}</AttachmentTitle>
                            <AttachmentDescription>
                              {file.relPath} · {formatDate(file.date)}
                            </AttachmentDescription>
                          </AttachmentContent>
                        </Attachment>
                      ))}
                    </AttachmentGroup>
                  )}
                </TabsContent>

                {/* MEETINGS TAB */}
                <TabsContent value="meetings" className="space-y-4 mt-2">
                  {details.meetings.length === 0 ? (
                    <EmptyState
                      icon={Calendar}
                      title="No linked meetings"
                      description={`Meetings with project: "${projectPath}" in their frontmatter will be automatically surfaced here.`}
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {details.meetings.map((meeting) => (
                        <div
                          key={meeting.relPath}
                          onClick={() => onSelectDocument?.(meeting.relPath)}
                          className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-4 shadow-2xs hover:border-[var(--hairline-strong)] transition-all cursor-pointer space-y-2.5"
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar size={14} />
                            <span>{formatDate(meeting.date)}</span>
                          </div>
                          <h4 className="text-[15px] font-semibold text-foreground line-clamp-2">
                            {meeting.title}
                          </h4>
                          {meeting.attendees?.length > 0 && (
                            <p className="text-xs text-muted-foreground truncate">
                              Attendees: {meeting.attendees.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* PEOPLE TAB */}
                <TabsContent value="people" className="space-y-4 mt-2">
                  {details.people.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No linked people"
                      description={`People in your vault with project: "${projectPath}" will be linked here.`}
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      {details.people.map((person) => {
                        const initials = person.name
                          .split(/\s+/)
                          .map((s) => s[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase();
                        return (
                          <div
                            key={person.relPath}
                            onClick={() => onSelectDocument?.(person.relPath)}
                            className="flex items-center gap-3 rounded-panel border border-[var(--space-sidebar-border)] bg-card p-3.5 shadow-2xs hover:border-[var(--hairline-strong)] transition-all cursor-pointer"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-sm font-bold text-white shadow-2xs">
                              {initials}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-[15px] font-semibold text-foreground truncate">
                                {person.name}
                              </h4>
                              <p className="text-xs text-muted-foreground truncate">
                                {person.role || person.org || 'Linked Person'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* TASKS TAB */}
                <TabsContent value="tasks" className="space-y-6 mt-2">
                  {projectTasks.length === 0 ? (
                    <EmptyState
                      icon={ListTodo}
                      title="No tasks in this project"
                      description="All open loops and action items for this project will appear here."
                    />
                  ) : (
                    <div className="space-y-5">
                      {tasksByPerson.map(({ person, tasks }) => {
                        const initials = person
                          .split(/\s+/)
                          .map((s) => s[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase();
                        const openCount = tasks.filter((t) => t.status === 'open').length;

                        return (
                          <div
                            key={person}
                            className="rounded-panel border border-[var(--space-sidebar-border)] bg-card overflow-hidden shadow-2xs"
                          >
                            {/* Person Group Header */}
                            <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] bg-[var(--surface-field)] px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-bold text-white shadow-2xs">
                                  {initials}
                                </span>
                                <h4 className="text-sm font-semibold text-foreground">
                                  {person}
                                </h4>
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                {openCount} open · {tasks.length} total
                              </span>
                            </div>

                            {/* Task List for this Person */}
                            <div className="divide-y divide-[var(--space-sidebar-border)]">
                              {tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-start gap-3.5 px-4 py-3.5 hover:bg-[var(--space-nav-hover)] transition-colors"
                                >
                                  <button
                                    onClick={() => handleToggleTask(task.id)}
                                    className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {task.status === 'done' ? (
                                      <CheckCircle2 size={18} className="text-emerald-500" />
                                    ) : (
                                      <Circle size={18} />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <span
                                      className={cn(
                                        'text-sm font-medium text-foreground block',
                                        task.status === 'done' && 'line-through text-muted-foreground'
                                      )}
                                    >
                                      {task.title}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {task.relPath && (
                                        <button
                                          onClick={() => onSelectDocument?.(task.relPath)}
                                          className="hover:text-foreground hover:underline font-mono text-[11px] truncate max-w-xs"
                                        >
                                          {task.relPath.split('/').pop()}
                                        </button>
                                      )}
                                      {task.deadline && (
                                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                          Due: {task.deadline}
                                        </span>
                                      )}
                                      {task.dependsOn && task.dependsOn !== 'None' && (
                                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                          Depends: {task.dependsOn}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}

          {/* Project not found state */}
          {project === null && (
            <EmptyState
              icon={FolderX}
              title="Project not found"
              description={`Could not find projects/${projectPath} in the vault.`}
              action={{
                label: 'Browse all projects',
                onClick: onNavigateProjects,
              }}
            />
          )}
        </div>
      </div>

      {/* Sleek Docked Project Composer (Bottom) */}
      {project && (
        <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)]/95 backdrop-blur-md px-6 py-4">
          <div className="max-w-4xl mx-auto">
            {errorMessage && (
              <div className="mb-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-500 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="chat-composer-stack">
              {/* Sticky d-source context tab above composer */}
              <div className="chat-context-shelf" aria-label="Composer context">
                <div className="chat-context-segment">
                  <Folder size={13} className="text-[var(--brand-accent)] shrink-0" />
                  <span className="text-xs font-semibold text-foreground">d-source:</span>
                  <span className="text-xs font-mono text-muted-foreground">projects/{projectPath}</span>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendText();
                }}
                className="chat-dock-composer"
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message, capture, or ask in ${project.title}…`}
                  disabled={isLoading}
                  className="quick-capture-input"
                />

                <div className="flex items-center gap-3 shrink-0">
                  <EnginePicker onEngineChange={setEngine} />

                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="quick-capture-send-button flex items-center justify-center"
                    title="Send (Enter)"
                    aria-label="Send"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
