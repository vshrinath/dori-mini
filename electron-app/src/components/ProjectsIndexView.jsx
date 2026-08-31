import { useEffect, useState, useMemo } from 'react';
import {
  FolderKanban,
  Search,
  Folder,
  FileText,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { Input } from './ui/input.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { cn } from '../lib/utils.js';

export function ProjectsIndexView({ onSelectProject, onSelectDocument }) {
  const [projects, setProjects] = useState(null);
  const [allDocs, setAllDocs] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    window.dori
      ?.call('list_projects', {})
      .then(setProjects)
      .catch(() => setProjects([]));

    window.dori
      ?.call('list_documents', { limit: 300 })
      .then(setAllDocs)
      .catch(() => setAllDocs([]));

    window.dori
      ?.call('list_tasks', { status: 'open' })
      .then(setAllTasks)
      .catch(() => setAllTasks([]));
  }, []);

  const projectStats = useMemo(() => {
    if (!projects) return new Map();
    const stats = new Map();
    for (const p of projects) {
      const pPath = `projects/${p.projectPath}`;
      const files = allDocs.filter((d) => d.rel_path.startsWith(pPath));
      const tasks = allTasks.filter(
        (t) => t.relPath?.startsWith(pPath) || t.projectPath === p.projectPath
      );
      const subprojects = projects.filter(
        (other) =>
          other.projectPath.startsWith(`${p.projectPath}/`) &&
          !other.projectPath.slice(p.projectPath.length + 1).includes('/')
      );
      stats.set(p.projectPath, {
        fileCount: files.length,
        taskCount: tasks.length,
        subprojectCount: subprojects.length,
      });
    }
    return stats;
  }, [projects, allDocs, allTasks]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === 'top-level' && p.projectPath.includes('/')) return false;
      if (filter === 'sub-projects' && !p.projectPath.includes('/')) return false;
      if (q) {
        return (
          p.title.toLowerCase().includes(q) ||
          p.projectPath.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [projects, search, filter]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame space-y-6">
        <RouteHeader
          title="Projects"
          description="What needs you next — browse workspace initiatives, notes, and task loops."
          meta={
            projects?.length > 0 ? (
              <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--brand-accent-text)]">
                {projects.length} project{projects.length === 1 ? '' : 's'}
              </span>
            ) : null
          }
        />

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-panel border border-[var(--space-sidebar-border)] bg-[var(--surface-field)] p-1 text-muted-foreground">
            {[
              { id: 'all', label: 'All Projects' },
              { id: 'top-level', label: 'Top-level' },
              { id: 'sub-projects', label: 'Sub-projects' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'rounded-control px-3.5 py-1.5 text-xs font-medium transition-all',
                  filter === tab.id
                    ? 'bg-card text-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="h-9 pl-8 text-sm bg-card border-border-soft rounded-control"
            />
          </div>
        </div>

        {/* Skeleton loading */}
        {projects === null && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-40 w-full rounded-panel" />
            <Skeleton className="h-40 w-full rounded-panel" />
            <Skeleton className="h-40 w-full rounded-panel" />
          </div>
        )}

        {/* Empty state */}
        {projects !== null && filteredProjects.length === 0 && (
          <EmptyState
            icon={FolderKanban}
            title={projects.length === 0 ? 'No projects found' : 'No matching projects'}
            description={
              projects.length === 0
                ? 'Create a project folder under projects/ in your vault to get started.'
                : 'Try adjusting your search or category filter.'
            }
          />
        )}

        {/* Projects Grid */}
        {filteredProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((p) => {
              const stat = projectStats.get(p.projectPath) || {
                fileCount: 0,
                taskCount: 0,
                subprojectCount: 0,
              };

              return (
                <div
                  key={p.projectPath}
                  onClick={() => onSelectProject?.(p.projectPath)}
                  className="group flex flex-col justify-between rounded-panel border border-[var(--space-sidebar-border)] bg-card p-5 shadow-2xs transition-all hover:border-[var(--hairline-strong)] hover:shadow-sm cursor-pointer"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-[var(--surface-tint)] text-[var(--brand-accent)] shadow-2xs group-hover:bg-[var(--brand-primary)] group-hover:text-white transition-colors">
                        <Folder size={20} strokeWidth={2} />
                      </div>
                      <Badge variant="muted" size="compact">
                        {p.status || 'Active'}
                      </Badge>
                    </div>

                    <div>
                      <h3 className="text-[16px] font-semibold text-foreground group-hover:text-[var(--brand-primary)] transition-colors">
                        {p.title}
                      </h3>
                      <p className="mt-0.5 text-xs font-mono text-muted-foreground truncate">
                        projects/{p.projectPath}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-[var(--space-sidebar-border)] flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <FileText size={13} />
                        {stat.fileCount} file{stat.fileCount === 1 ? '' : 's'}
                      </span>
                      {stat.taskCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <CheckCircle2 size={13} />
                          {stat.taskCount} task{stat.taskCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-[var(--brand-primary)]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
