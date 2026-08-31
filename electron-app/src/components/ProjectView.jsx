// Header matches dori-portal's real EntityHeader (app/projects/[...slug]/page.tsx):
// breadcrumb trail, title, status pill, metadata line joined with "·" rather
// than badges. Sub-projects render as a plain link row below, mirroring
// SubProjectsRow — not the EntityCard/SignalCard content cards further down
// the real page, which dori-mini has no document data to back yet.
import { useEffect, useState } from 'react';
import { ChevronRight, Folder, FolderX, Home } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Skeleton } from './ui/skeleton.jsx';

export function ProjectView({ projectPath, onSelectProject }) {
  const [project, setProject] = useState(undefined);
  const [children, setChildren] = useState([]);

  useEffect(() => {
    setProject(undefined);
    setChildren([]);
    window.dori
      .call('list_projects', {})
      .then((list) => {
        setProject(list.find((p) => p.projectPath === projectPath) || null);
        setChildren(list.filter((p) => p.projectPath.startsWith(`${projectPath}/`) && !p.projectPath.slice(projectPath.length + 1).includes('/')));
      })
      .catch(() => setProject(null));
  }, [projectPath]);

  const crumbs = projectPath?.split('/') || [];

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="bg-background sticky top-0 z-10 border-b px-4 py-3">
        {project === undefined && (
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        )}
        {project && (
          <>
            <div className="text-muted-foreground mb-1 flex items-center gap-1 text-xs">
              <Home size={12} className="shrink-0" />
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight size={11} className="shrink-0" />
                  <span className={i === crumbs.length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">{project.title}</h1>
              <Badge size="compact">{project.status}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              updated {new Date(project.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              {children.length > 0 && ` · ${children.length} sub-project${children.length === 1 ? '' : 's'}`}
            </p>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {project === null && (
          <EmptyState icon={FolderX} title="Project not found" description="It may have been renamed or removed from the vault." />
        )}
        {children.length > 0 && (
          <div className="border-border bg-card rounded-panel overflow-hidden border">
            {children.map((c) => (
              <button
                key={c.projectPath}
                onClick={() => onSelectProject?.(c.projectPath)}
                className="hover:bg-muted/45 border-border flex w-full items-center gap-2.5 border-b px-4 py-3 text-left transition-colors last:border-b-0"
              >
                <Folder size={14} className="text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                <Badge size="compact" variant="muted">{c.status}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
