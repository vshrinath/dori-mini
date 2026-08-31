import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';

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
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {project === null && (
          <p className="text-sm text-muted-foreground">Project not found.</p>
        )}
        {project && (
          <div className="flex items-start gap-3">
            <Folder size={18} className="mt-0.5 shrink-0 text-foreground-secondary" />
            <div>
              <p className="text-sm font-medium">{project.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {project.status} · updated{' '}
                {new Date(project.updatedAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
