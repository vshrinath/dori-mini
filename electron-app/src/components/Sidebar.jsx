// Visual language copied from dori-portal/app/space-shell.css class-by-class
// (space-nav-link, sidebar-project-row, sidebar-profile-card, sidebar-thread-heading)
// as Tailwind arbitrary-value utilities, rather than lifting sidebar.tsx /
// sidebar-container.tsx wholesale — those are 600+ lines coupled to
// next/navigation, vaul Drawer, and half a dozen hooks this single-window
// app doesn't have. Same look, none of that machinery.
import { useEffect, useState } from 'react';
import { Inbox, Check, Folder, ChevronRight, Library } from 'lucide-react';
import { cn } from '../lib/utils.js';

const NAV = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'tasks', label: 'Tasks', icon: Check },
  { id: 'library', label: 'Library', icon: Library }
];

const navLinkClass = (active) =>
  cn(
    'flex min-h-[2.15rem] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[0.8125rem] font-medium transition-colors',
    active
      ? 'bg-[var(--space-sidebar-field)] text-foreground-secondary'
      : 'text-foreground-secondary hover:bg-[var(--space-nav-hover)]'
  );

function buildProjectTree(projects) {
  const roots = [];
  const byPath = new Map();
  for (const p of projects) {
    const node = { ...p, children: [] };
    byPath.set(p.projectPath, node);
  }
  for (const node of byPath.values()) {
    const parentPath = node.projectPath.includes('/')
      ? node.projectPath.slice(0, node.projectPath.lastIndexOf('/'))
      : null;
    const parent = parentPath && byPath.get(parentPath);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function ProjectRow({ node, depth, selected, onSelect }) {
  const isSelected = selected === node.projectPath;
  return (
    <>
      <button
        onClick={() => onSelect(node.projectPath)}
        style={{ paddingLeft: `${0.6 + depth * 0.9}rem` }}
        className={cn(
          'flex min-h-[2.15rem] w-full items-center gap-2.5 rounded-[10px] pr-2.5 text-left text-[0.8125rem] font-medium transition-colors',
          isSelected
            ? 'bg-[var(--space-nav-hover)] text-foreground-secondary'
            : 'text-foreground-secondary hover:bg-[var(--space-nav-hover)]'
        )}
      >
        <Folder size={14} className="shrink-0 text-foreground-secondary" />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </button>
      {node.children.map((child) => (
        <ProjectRow
          key={child.projectPath}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function ProfileFooter({ onSelect, profileVersion }) {
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    window.dori
      .call('get_profile', {})
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [profileVersion]);

  const name = profile?.name || 'Profile';
  const initials = profile
    ? profile.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <button
      onClick={() => onSelect('profile')}
      className="mt-auto flex items-center gap-2.5 border-t border-[var(--space-sidebar-border)] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--space-nav-hover)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-[0.65rem] font-medium text-[var(--color-cta-text)]">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-medium text-foreground-secondary">
          {name}
        </span>
        {profile?.role && (
          <span className="block truncate text-[0.68rem] text-muted-foreground">
            {profile.role}
          </span>
        )}
      </span>
    </button>
  );
}

export function Sidebar({ active, onSelect, profileVersion }) {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    window.dori
      .call('list_projects', {})
      .then((list) => setProjects(buildProjectTree(list)))
      .catch(() => setProjects([]));
  }, []);

  return (
    <nav className="flex w-60 shrink-0 flex-col bg-[var(--space-sidebar-bg)] pt-[0.6rem]">
      <div className="mb-1 flex items-center border-b border-[var(--space-sidebar-border)] px-2.5 pb-3">
        <span className="font-display text-base font-medium tracking-[-0.02em] text-foreground-secondary">
          Dori
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-1.5 pt-1.5">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onSelect(id)} className={navLinkClass(active === id)}>
            <Icon size={16} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        ))}
      </div>

      {projects.length > 0 && (
        <div className="mt-2 flex-1 overflow-y-auto px-1.5">
          <div className="flex items-center gap-1.5 px-2.5 py-2 text-[0.8125rem] font-medium text-foreground-secondary">
            <ChevronRight size={13} className="shrink-0" />
            Projects
          </div>
          <div className="flex flex-col gap-0.5">
            {projects.map((node) => (
              <ProjectRow
                key={node.projectPath}
                node={node}
                depth={0}
                selected={active.startsWith('project:') ? active.slice(8) : null}
                onSelect={(path) => onSelect(`project:${path}`)}
              />
            ))}
          </div>
        </div>
      )}

      <ProfileFooter onSelect={onSelect} profileVersion={profileVersion} />
    </nav>
  );
}
