// Skeleton matches the real dori-portal sidebar (app/sidebar.tsx +
// app/space-shell.css's `.sidebar-flat`/`.sidebar-nav`/`.sidebar-bottom-bar`):
// one flex-column region — fixed header, THEN a *single* `flex-1 overflow-y-auto`
// middle region holding both the nav links and the project tree together (not
// two separately-scrolling blocks), then a footer pinned via `mt-auto` rather
// than living outside the scroll region. Tailwind's `flex-1` already resolves
// to `flex: 1 1 0%` (flex-basis 0), same as the real CSS's `.sidebar-nav { flex: 1 }`
// — that basis-0 is what lets `overflow-y-auto` actually clip instead of the
// content pushing the container taller than the window. `h-full` on <nav> gives
// it the real height to clip against, mirroring the real sidebar's `height: 100vh`
// anchor (`.app-shell-sidebar { position: sticky; height: 100vh }`).
//
// Indentation for nested projects is a `pl-4` wrapper around each level's
// children (matching `.sidebar-nav-group-children { padding-left: 1rem }`),
// not per-row inline depth*rem math.
//
// Deliberately NOT ported: the project-row kebab menu (dropdown-menu) and the
// profile footer's popover menu (settings/theme/connections/log out) — both
// are real dori-portal chrome, but neither has anything to back it here
// (no rename/archive actions, no settings, no auth to log out of). Wiring
// those primitives in with no real actions behind them would be decorative
// fakery, not polish. The profile footer instead does the one real thing it
// can: navigate to the Profile screen.
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

function ProjectRow({ node, selected, onSelect }) {
  const isSelected = selected === node.projectPath;
  return (
    <div>
      <button
        onClick={() => onSelect(node.projectPath)}
        className={cn(
          'flex min-h-[2.15rem] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[0.8125rem] font-medium transition-colors',
          isSelected
            ? 'bg-[var(--space-nav-hover)] text-foreground-secondary'
            : 'text-foreground-secondary hover:bg-[var(--space-nav-hover)]'
        )}
      >
        <Folder size={14} className="shrink-0 text-foreground-secondary" />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </button>
      {node.children.length > 0 && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
          {node.children.map((child) => (
            <ProjectRow key={child.projectPath} node={child} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
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
      className="mt-auto flex shrink-0 items-center gap-2.5 border-t border-[var(--space-sidebar-border)] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--space-nav-hover)]"
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
    <nav className="flex h-full w-60 shrink-0 flex-col bg-[var(--space-sidebar-bg)]">
      <div className="mb-1.5 flex shrink-0 items-center border-b border-[var(--space-sidebar-border)] px-2.5 pb-3 pt-[0.6rem]">
        <span className="font-display text-base font-medium tracking-[-0.02em] text-foreground-secondary">
          Dori
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5">
        <div className="flex flex-col gap-0.5 pt-1.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onSelect(id)} className={navLinkClass(active === id)}>
              <Icon size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 px-2.5 py-2 text-[0.8125rem] font-medium text-foreground-secondary">
              <ChevronRight size={13} className="shrink-0" />
              Projects
            </div>
            <div className="flex flex-col gap-0.5">
              {projects.map((node) => (
                <ProjectRow
                  key={node.projectPath}
                  node={node}
                  selected={active.startsWith('project:') ? active.slice(8) : null}
                  onSelect={(path) => onSelect(`project:${path}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <ProfileFooter onSelect={onSelect} profileVersion={profileVersion} />
    </nav>
  );
}
