import { useEffect, useState, useRef } from 'react';
import {
  Inbox,
  Check,
  Folder,
  ChevronDown,
  ChevronRight,
  Library,
  Search,
  SquarePen,
  Plus,
  Settings,
  FileText,
  User,
} from 'lucide-react';
import { cn } from '../lib/utils.js';

const NAV = [
  { id: 'chat', label: 'New chat', icon: SquarePen },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'tasks', label: 'Tasks', icon: Check },
  { id: 'library', label: 'Library', icon: Library },
];

const navLinkClass = (active) =>
  cn(
    'flex min-h-[2.35rem] w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[0.8125rem] font-medium transition-colors',
    active
      ? 'bg-[var(--space-sidebar-field)] text-foreground font-semibold shadow-xs'
      : 'text-foreground-secondary hover:bg-[var(--space-nav-hover)] hover:text-foreground'
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

function ProjectRow({ node, selected, onSelect, depth = 0 }) {
  const isSelected = selected === node.projectPath;
  return (
    <div>
      <button
        onClick={() => onSelect(node.projectPath)}
        className={cn(
          'flex min-h-[2.15rem] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[0.8125rem] font-medium transition-colors',
          isSelected
            ? 'bg-[var(--space-nav-hover)] text-foreground font-semibold'
            : 'text-foreground-secondary hover:bg-[var(--space-nav-hover)] hover:text-foreground'
        )}
      >
        <Folder size={14} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </button>
      {node.children.length > 0 && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-3.5 border-l border-[var(--space-sidebar-border)] ml-3">
          {node.children.map((child) => (
            <ProjectRow
              key={child.projectPath}
              node={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileFooter({ onOpenSettings, profileVersion }) {
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    window.dori
      ?.call('get_profile', {})
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [profileVersion]);

  const name = profile?.name || 'My Space';
  const role = profile?.role || 'Personal Vault';
  const initials = profile?.name
    ? profile.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'D';

  return (
    <div className="mt-auto border-t border-[var(--space-sidebar-border)] p-2">
      <button
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors hover:bg-[var(--space-nav-hover)]"
        title="Settings (Cmd+,)"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-[0.65rem] font-semibold text-[var(--color-cta-text)] shadow-xs">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">
            {name}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {role}
          </span>
        </span>
        <Settings size={14} className="text-muted-foreground shrink-0 opacity-60 hover:opacity-100" />
      </button>
    </div>
  );
}

export function Sidebar({
  active,
  onSelect,
  onOpenSearch,
  onOpenSettings,
  onNewNote,
  profileVersion,
}) {
  const [projects, setProjects] = useState([]);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);

  useEffect(() => {
    window.dori
      ?.call('list_projects', {})
      .then((list) => setProjects(buildProjectTree(list)))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setIsAddMenuOpen(false);
      }
    };
    if (isAddMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAddMenuOpen]);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--space-sidebar-border)] bg-[var(--surface-canvas)]">
      {/* Header */}
      <div className="relative flex shrink-0 items-center justify-between border-b border-[var(--space-sidebar-border)] px-4 py-3">
        <span className="font-display text-base font-semibold tracking-[-0.03em] text-foreground">
          Dori
        </span>
        <div ref={addMenuRef} className="relative">
          <button
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--space-sidebar-field)] text-foreground-secondary transition-colors hover:bg-[var(--space-nav-hover)] hover:text-foreground"
            title="Create or Capture"
            aria-label="Create"
          >
            <Plus size={14} />
          </button>

          {isAddMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-panel border border-border bg-card p-1 shadow-lg z-30 anim-rise">
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onNewNote?.();
                }}
                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <FileText size={14} className="text-muted-foreground" />
                <span>New Note</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect('chat');
                }}
                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <SquarePen size={14} className="text-muted-foreground" />
                <span>New Chat</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect('profile');
                }}
                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <User size={14} className="text-muted-foreground" />
                <span>Profile Space</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Scroll Region */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Search Bar */}
        <button
          onClick={onOpenSearch}
          className="flex min-h-[2.15rem] w-full items-center gap-2 rounded-lg border border-[var(--space-sidebar-border)] bg-card px-2.5 py-1.5 text-left text-xs font-medium text-foreground-secondary transition-all hover:border-[var(--hairline-strong)] hover:bg-[var(--space-nav-hover)]"
        >
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">Search</span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            /
          </kbd>
        </button>

        {/* Spaces Nav */}
        <div className="flex flex-col gap-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={navLinkClass(active === id)}
            >
              <Icon size={16} className="shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Projects Accordion */}
        {projects.length > 0 && (
          <div className="pt-2 border-t border-[var(--space-sidebar-border)]">
            <button
              type="button"
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {projectsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>Projects</span>
              </div>
              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono font-medium">
                {projects.length}
              </span>
            </button>

            {projectsOpen && (
              <div className="mt-1 flex flex-col gap-0.5 pl-1">
                {projects.map((node) => (
                  <ProjectRow
                    key={node.projectPath}
                    node={node}
                    selected={active.startsWith('project:') ? active.slice(8) : null}
                    onSelect={(path) => onSelect(`project:${path}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Profile Footer */}
      <ProfileFooter
        onOpenSettings={onOpenSettings}
        profileVersion={profileVersion}
      />
    </aside>
  );
}
