import { useEffect, useState } from 'react';
import { ChevronRight, Folder, FolderX, Home } from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { ChatView } from './ChatView.jsx';

export function ProjectView({ projectPath, onSelectProject }) {
  const [project, setProject] = useState(undefined);
  const [children, setChildren] = useState([]);

  useEffect(() => {
    setProject(undefined);
    setChildren([]);
    window.dori
      ?.call('list_projects', {})
      .then((list) => {
        setProject(list.find((p) => p.projectPath === projectPath) || null);
        setChildren(
          list.filter(
            (p) =>
              p.projectPath.startsWith(`${projectPath}/`) &&
              !p.projectPath.slice(projectPath.length + 1).includes('/')
          )
        );
      })
      .catch(() => setProject(null));
  }, [projectPath]);

  const crumbs = projectPath?.split('/') || [];

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame space-y-6">
        {project === undefined && (
          <div className="flex items-start gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        )}

        {project && (
          <>
            <RouteHeader
              title={project.title}
              description={
                <span>
                  Updated {new Date(project.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {children.length > 0 && ` · ${children.length} sub-project${children.length === 1 ? '' : 's'}`}
                </span>
              }
              meta={
                <Badge variant="muted" size="compact">
                  {project.status || 'Active'}
                </Badge>
              }
            />

            {children.length > 0 && (
              <div className="rounded-panel border border-border-soft bg-card overflow-hidden shadow-xs">
                <div className="border-b border-border-soft px-4 py-2 text-xs font-semibold text-muted-foreground">
                  Sub-projects
                </div>
                {children.map((c) => (
                  <button
                    key={c.projectPath}
                    onClick={() => onSelectProject?.(c.projectPath)}
                    className="flex w-full items-center gap-2.5 border-b border-border-soft px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <Folder size={15} className="text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {c.title}
                    </span>
                    <Badge size="compact" variant="muted">
                      {c.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-panel border border-border-soft bg-card overflow-hidden shadow-sm h-[560px] flex flex-col">
              <ChatView projectContext={projectPath} className="h-full" />
            </div>
          </>
        )}

        {project === null && (
          <EmptyState
            icon={FolderX}
            title="Project not found"
            description="It may have been renamed or removed from the vault."
          />
        )}
      </div>
    </div>
  );
}
