import { useEffect, useState } from 'react';
import { Folder, FolderX } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Skeleton } from './ui/skeleton.jsx';

export function ProjectView({ projectPath }) {
  const [project, setProject] = useState(undefined);

  useEffect(() => {
    setProject(undefined);
    window.dori
      .call('list_projects', {})
      .then((list) => setProject(list.find((p) => p.projectPath === projectPath) || null))
      .catch(() => setProject(null));
  }, [projectPath]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h1 className="text-sm font-semibold">{projectPath}</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {project === undefined && (
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        )}
        {project === null && (
          <EmptyState icon={FolderX} title="Project not found" description="It may have been renamed or removed from the vault." />
        )}
        {project && (
          <div className="flex items-start gap-3">
            <Folder size={18} className="mt-0.5 shrink-0 text-foreground-secondary" />
            <div>
              <p className="text-sm font-medium">{project.title}</p>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge size="compact">{project.status}</Badge>
                <span>
                  updated{' '}
                  {new Date(project.updatedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
