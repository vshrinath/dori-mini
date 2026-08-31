import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Inbox,
  Check,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Library,
  Search,
  SquarePen,
  Plus,
  Settings,
  FileText,
  User,
  FolderKanban,
} from 'lucide-react';
import { cn } from '../lib/utils.js';

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_STORAGE_KEY = 'dori.sidebar.width';

const NAV = [
  { id: 'chat', label: 'New chat', icon: SquarePen },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'tasks', label: 'Tasks', icon: Check },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'library', label: 'Library', icon: Library },
];

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
  const hasChildren = node.children && node.children.length > 0;
  const Icon = isSelected ? FolderOpen : Folder;

  return (
    <div>
      <button
        onClick={() => onSelect(node.projectPath)}
        className={cn(
          'flex min-h-[2.65rem] w-full items-center gap-3 rounded-control px-3.5 py-2 text-left text-[15.5px] font-medium transition-all',
          isSelected
            ? 'bg-[var(--space-sidebar-field)] text-foreground font-semibold shadow-2xs'
            : 'text-foreground hover:bg-[var(--space-nav-hover)] hover:text-foreground'
        )}
      >
        <Icon
          size={20}
          className={cn(
            'shrink-0 transition-colors',
            isSelected ? 'text-[var(--brand-primary)]' : 'text-[var(--brand-accent)]'
          )}
          strokeWidth={1.8}
        />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </button>

      {hasChildren && (
        <div className="mt-1 flex flex-col gap-0.5 pl-3.5 border-l-2 border-[var(--space-sidebar-border)] ml-4">
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

  const name = profile?.name || 'Shrinath V';
  const role = profile?.role || 'Founder';
  const initials = profile?.name
    ? profile.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'SV';

  return (
    <div className="mt-auto border-t border-[var(--space-sidebar-border)] p-3.5">
      <button
        onClick={onOpenSettings}
        className="flex w-full items-center gap-3.5 rounded-panel border border-[var(--space-sidebar-border)] bg-card p-3.5 text-left shadow-2xs transition-all hover:border-[var(--hairline-strong)] hover:bg-[var(--space-nav-hover)]"
        title="Settings (Cmd+,)"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[15px] font-bold text-white shadow-xs">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-foreground">
            {name}
          </span>
          <span className="block truncate text-xs text-muted-foreground mt-0.5">
            {role}
          </span>
        </span>
        <Settings size={19} className="text-muted-foreground shrink-0 opacity-70 hover:opacity-100 hover:text-foreground transition-all" />
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= SIDEBAR_MIN_WIDTH && saved <= SIDEBAR_MAX_WIDTH
      ? saved
      : SIDEBAR_DEFAULT_WIDTH;
  });
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

  // Sidebar drag-resize handler
  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      document.body.classList.add('is-resizing-sidebar');

      const handleMove = (moveEvent) => {
        const nextWidth = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX)
        );
        setSidebarWidth(nextWidth);
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextWidth));
      };

      const handleEnd = () => {
        document.body.classList.remove('is-resizing-sidebar');
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
    },
    [sidebarWidth]
  );

  return (
    <aside
      style={{ width: `${sidebarWidth}px`, minWidth: `${SIDEBAR_MIN_WIDTH}px`, maxWidth: `${SIDEBAR_MAX_WIDTH}px` }}
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--space-sidebar-border)] bg-[var(--surface-canvas)] select-none"
    >
      {/* Brand Header */}
      <div className="relative flex shrink-0 items-center justify-between border-b border-[var(--space-sidebar-border)] px-5 py-4">
        <span className="font-display text-[21px] font-bold tracking-[-0.03em] text-foreground">
          Dori
        </span>
        <div ref={addMenuRef} className="relative">
          <button
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-control bg-[var(--brand-primary)] text-white transition-transform hover:scale-105 active:scale-95 shadow-xs"
            title="Create or Capture"
            aria-label="Create"
          >
            <Plus size={18} strokeWidth={2.2} />
          </button>

          {isAddMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-panel border border-border bg-card p-1.5 shadow-xl z-30 anim-rise">
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onNewNote?.();
                }}
                className="flex w-full items-center gap-3 rounded-control px-3.5 py-2.5 text-left text-[15px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <FileText size={17} className="text-muted-foreground" />
                <span>New Note</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect('chat');
                }}
                className="flex w-full items-center gap-3 rounded-control px-3.5 py-2.5 text-left text-[15px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <SquarePen size={17} className="text-muted-foreground" />
                <span>New Chat</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect('profile');
                }}
                className="flex w-full items-center gap-3 rounded-control px-3.5 py-2.5 text-left text-[15px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <User size={17} className="text-muted-foreground" />
                <span>Profile Space</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Scroll Region */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Search Bar */}
        <button
          onClick={onOpenSearch}
          className="flex min-h-[2.75rem] w-full items-center gap-3 rounded-control border border-[var(--space-sidebar-border)] bg-card px-3.5 py-2 text-left text-[15px] font-medium text-foreground transition-all hover:border-[var(--hairline-strong)] hover:bg-[var(--space-nav-hover)] shadow-2xs"
        >
          <Search size={19} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-foreground-secondary">Search</span>
          <kbd className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground">
            /
          </kbd>
        </button>

        {/* Spaces Nav */}
        <div className="flex flex-col gap-1.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className={cn(
                  'flex min-h-[2.85rem] w-full items-center gap-3.5 rounded-control px-4 py-2.5 text-left text-[16px] transition-all',
                  isActive
                    ? 'bg-[var(--space-sidebar-field)] text-foreground font-bold shadow-2xs'
                    : 'text-foreground font-medium hover:bg-[var(--space-nav-hover)]'
                )}
              >
                <Icon
                  size={21}
                  className={cn(
                    'shrink-0 transition-colors',
                    isActive ? 'text-[var(--brand-primary)]' : 'text-muted-foreground'
                  )}
                  strokeWidth={1.8}
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Projects Accordion */}
        {projects.length > 0 && (
          <div className="pt-3 border-t border-[var(--space-sidebar-border)]">
            <button
              type="button"
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-2">
                {projectsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span>Projects</span>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono font-bold text-foreground-secondary">
                {projects.length}
              </span>
            </button>

            {projectsOpen && (
              <div className="mt-1.5 flex flex-col gap-0.5 pl-1">
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

      {/* Draggable Resize Boundary Handle */}
      <div
        className="sidebar-resize-handle"
        title="Drag to resize sidebar (double-click to reset)"
        onPointerDown={handleResizeStart}
        onDoubleClick={() => {
          setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
          localStorage.setItem(SIDEBAR_STORAGE_KEY, String(SIDEBAR_DEFAULT_WIDTH));
        }}
      />
    </aside>
  );
}
