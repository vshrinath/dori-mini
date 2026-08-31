import { useEffect, useState, useMemo } from 'react';
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
  Sparkles,
  ExternalLink,
  MessageSquare,
  ListTodo,
  Layers,
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
import { ChatView } from './ChatView.jsx';
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

export function ProjectView({
  projectPath,
  onSelectProject,
  onSelectDocument,
  onNavigateHome,
  onNavigateProjects,
}) {
  const [project, setProject] = useState(undefined);
  const [children, setChildren] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [contextDoc, setContextDoc] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    setProject(undefined);
    setChildren([]);
    setContextDoc(null);

    // 1. Fetch project meta & children
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

    // 2. Fetch all indexed documents in vault
    window.dori
      ?.call('list_documents', { limit: 500 })
      .then((docs) => setAllDocs(docs || []))
      .catch(() => setAllDocs([]));

    // 3. Fetch open tasks
    window.dori
      ?.call('list_tasks', { status: 'all' })
      .then((tasks) => setAllTasks(tasks || []))
      .catch(() => setAllTasks([]));
  }, [projectPath]);

  // Filter files belonging to this project
  const projectFiles = useMemo(() => {
    const prefix = `projects/${projectPath}/`;
    return allDocs
      .filter((d) => d.rel_path?.startsWith(prefix))
      .map((d) => ({
        ...d,
        name: d.rel_path.slice(prefix.length),
        extension: d.rel_path.split('.').pop()?.toLowerCase() || '',
      }));
  }, [allDocs, projectPath]);

  // Try to find context document (.setup.md, context.md, project.md, README.md)
  useEffect(() => {
    if (projectFiles.length === 0) return;
    const candidates = ['.setup.md', 'context.md', 'project.md', 'README.md', 'brief.md'];
    const found =
      projectFiles.find((f) => candidates.includes(f.name)) ||
      projectFiles.find((f) => f.name.endsWith('.md'));

    if (found) {
      window.dori
        ?.call('get_document', { path: found.rel_path })
        .then(setContextDoc)
        .catch(() => {});
    }
  }, [projectFiles]);

  // Filter tasks belonging to this project
  const projectTasks = useMemo(() => {
    const prefix = `projects/${projectPath}`;
    return allTasks.filter(
      (t) => t.relPath?.startsWith(prefix) || t.projectPath === projectPath
    );
  }, [allTasks, projectPath]);

  // Handle task status toggle
  const handleToggleTask = async (taskId) => {
    try {
      await window.dori?.call('mark_task_done', { id: taskId });
      setAllTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'done' } : t))
      );
    } catch (e) {
      console.error('Failed to toggle task:', e);
    }
  };

  // Breadcrumbs calculation
  const pathSegments = projectPath?.split('/') || [];

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame space-y-6">
        {/* Loading state */}
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
            {/* Breadcrumb Trail */}
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
                  <span>projects/{projectPath}</span>
                  <span>·</span>
                  <span>{projectFiles.length} file{projectFiles.length === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>{projectTasks.filter((t) => t.status === 'open').length} open loop{projectTasks.filter((t) => t.status === 'open').length === 1 ? '' : 's'}</span>
                  {children.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{children.length} sub-project{children.length === 1 ? '' : 's'}</span>
                    </>
                  )}
                </span>
              }
              meta={
                <div className="flex items-center gap-2">
                  <Badge variant="muted" size="compact">
                    {project.status || 'Active'}
                  </Badge>
                </div>
              }
            />

            {/* Sub-projects Bar (if any) */}
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

            {/* Multi-Tab Workspace */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-fit">
                <TabsTrigger value="overview" className="gap-2">
                  <FileText size={15} />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="files" className="gap-2">
                  <FolderOpen size={15} />
                  Files ({projectFiles.length})
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-2">
                  <ListTodo size={15} />
                  Tasks ({projectTasks.filter((t) => t.status === 'open').length})
                </TabsTrigger>
                <TabsTrigger value="chat" className="gap-2">
                  <MessageSquare size={15} />
                  Context Chat
                </TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-6 mt-2">
                {/* Context Brief Preview Card */}
                {contextDoc && (
                  <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] pb-3 mb-3">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-[var(--brand-primary)]" />
                        <h3 className="text-sm font-semibold text-foreground">
                          {contextDoc.title || 'Project Context'}
                        </h3>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelectDocument?.(contextDoc.rel_path)}
                        className="text-xs text-muted-foreground hover:text-foreground h-7 px-2.5 gap-1.5"
                      >
                        <span>Open Document</span>
                        <ExternalLink size={12} />
                      </Button>
                    </div>
                    <p className="text-sm text-foreground-secondary leading-relaxed line-clamp-4 font-normal">
                      {contextDoc.content?.slice(0, 450)}…
                    </p>
                  </div>
                )}

                {/* Recent Project Files Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-foreground">
                      Project Files ({projectFiles.length})
                    </h3>
                    {projectFiles.length > 6 && (
                      <button
                        onClick={() => setActiveTab('files')}
                        className="text-xs font-semibold text-[var(--brand-primary)] hover:underline"
                      >
                        View all {projectFiles.length} files →
                      </button>
                    )}
                  </div>

                  {projectFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No files recorded under projects/{projectPath}/ yet.
                    </p>
                  ) : (
                    <AttachmentGroup>
                      {projectFiles.slice(0, 6).map((file) => (
                        <Attachment
                          key={file.rel_path}
                          onClick={() => onSelectDocument?.(file.rel_path)}
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
                      Open Loops & Actions ({projectTasks.filter((t) => t.status === 'open').length})
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

                {/* Embedded Project AI Chat */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
                    <Sparkles size={16} className="text-[var(--brand-primary)]" />
                    <span>Project Discussion & Notes</span>
                  </h3>
                  <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card overflow-hidden shadow-2xs h-[500px] flex flex-col">
                    <ChatView projectContext={projectPath} className="h-full" />
                  </div>
                </div>
              </TabsContent>

              {/* FILES TAB */}
              <TabsContent value="files" className="space-y-4 mt-2">
                {projectFiles.length === 0 ? (
                  <EmptyState
                    icon={FolderX}
                    title="No files yet"
                    description={`Add files to projects/${projectPath} in your vault to view them here.`}
                  />
                ) : (
                  <div className="space-y-4">
                    <AttachmentGroup>
                      {projectFiles.map((file) => (
                        <Attachment
                          key={file.rel_path}
                          onClick={() => onSelectDocument?.(file.rel_path)}
                          className="cursor-pointer"
                        >
                          <AttachmentMedia>
                            {getFileIcon(file.name)}
                          </AttachmentMedia>
                          <AttachmentContent>
                            <AttachmentTitle>{file.name}</AttachmentTitle>
                            <AttachmentDescription>
                              {file.rel_path} · {formatDate(file.date)}
                            </AttachmentDescription>
                          </AttachmentContent>
                        </Attachment>
                      ))}
                    </AttachmentGroup>
                  </div>
                )}
              </TabsContent>

              {/* TASKS TAB */}
              <TabsContent value="tasks" className="space-y-4 mt-2">
                {projectTasks.length === 0 ? (
                  <EmptyState
                    icon={ListTodo}
                    title="No tasks in this project"
                    description="All open loops and action items for this project will appear here."
                  />
                ) : (
                  <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card overflow-hidden shadow-2xs divide-y divide-[var(--space-sidebar-border)]">
                    {projectTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-[var(--space-nav-hover)] transition-colors"
                      >
                        <button
                          onClick={() => handleToggleTask(task.id)}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {task.status === 'done' ? (
                            <CheckCircle2 size={19} className="text-emerald-500" />
                          ) : (
                            <Circle size={19} />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'text-sm font-medium text-foreground block truncate',
                              task.status === 'done' && 'line-through text-muted-foreground'
                            )}
                          >
                            {task.title}
                          </span>
                          {task.sourceFile && (
                            <span className="text-xs text-muted-foreground block truncate mt-0.5 font-mono">
                              {task.sourceFile}
                            </span>
                          )}
                        </div>
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
                )}
              </TabsContent>

              {/* CHAT TAB */}
              <TabsContent value="chat" className="mt-2">
                <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card overflow-hidden shadow-2xs h-[650px] flex flex-col">
                  <ChatView projectContext={projectPath} className="h-full" />
                </div>
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
  );
}
