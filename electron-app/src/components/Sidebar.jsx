import { useEffect, useState, useRef, useCallback } from "react";
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
  Receipt,
  Clock,
  Users,
  Building2,
  FolderPlus,
} from "lucide-react";
import { cn } from "../lib/utils.js";

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_STORAGE_KEY = "dori.sidebar.width";

const NAV = [
  { id: "chat", label: "New chat", icon: SquarePen },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: Check },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "finance", label: "Finance", icon: Receipt },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "entities", label: "Entities", icon: Users },
  { id: "library", label: "Library", icon: Library },
];

function buildProjectTree(projects) {
  const roots = [];
  const byPath = new Map();
  for (const p of projects) {
    const node = { ...p, children: [] };
    byPath.set(p.projectPath, node);
  }
  for (const node of byPath.values()) {
    const parentPath = node.projectPath.includes("/")
      ? node.projectPath.slice(0, node.projectPath.lastIndexOf("/"))
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

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.projectPath)}
        className={cn(
          "group flex min-h-[2.35rem] w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[14px] transition-all cursor-pointer",
          isSelected
            ? "bg-[var(--space-sidebar-field)] text-foreground font-semibold shadow-2xs ring-1 ring-border/40"
            : "text-foreground-secondary font-medium hover:bg-[var(--space-nav-hover)] hover:text-foreground"
        )}
      >
        {depth === 0 ? (
          <Folder
            size={16}
            className={cn(
              "shrink-0 transition-colors",
              isSelected ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground"
            )}
            strokeWidth={2}
          />
        ) : (
          <div className="flex items-center justify-center shrink-0 w-4 h-4">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                isSelected
                  ? "bg-[var(--brand-primary)] scale-125"
                  : "bg-muted-foreground/60 group-hover:bg-foreground"
              )}
            />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </button>

      {hasChildren && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-2.5 border-l-2 border-border/60 ml-3.5">
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

function ProfileFooter({ onOpenSettings, onSelectProfile, profileVersion }) {
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    window.dori
      ?.call("get_profile", {})
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [profileVersion]);

  const name = profile?.name || "Shrinath V";
  const role = profile?.role || "Founder";
  const initials = profile?.name
    ? profile.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "SV";

  return (
    <div className="mt-auto border-t border-[var(--space-sidebar-border)] p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelectProfile}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-panel border border-[var(--space-sidebar-border)] bg-card p-2.5 text-left shadow-2xs transition-all hover:border-[var(--hairline-strong)] hover:bg-[var(--space-nav-hover)]"
          title="View Profile Space"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-bold text-white shadow-xs">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-foreground">
              {name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {role}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-[var(--space-sidebar-border)] bg-card text-muted-foreground shadow-2xs transition-all hover:border-[var(--hairline-strong)] hover:bg-[var(--space-nav-hover)] hover:text-foreground"
          title="Settings (Cmd+,)"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
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
  const [inboxCount, setInboxCount] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(saved) &&
      saved >= SIDEBAR_MIN_WIDTH &&
      saved <= SIDEBAR_MAX_WIDTH
      ? saved
      : SIDEBAR_DEFAULT_WIDTH;
  });
  const addMenuRef = useRef(null);

  useEffect(() => {
    window.dori
      ?.call("list_projects", {})
      .then((list) => setProjects(buildProjectTree(list || [])))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    window.dori
      ?.call("list_inbox", {})
      .then((items) => setInboxCount(items?.length || 0))
      .catch(() => setInboxCount(0));
  }, [active]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setIsAddMenuOpen(false);
      }
    };
    if (isAddMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isAddMenuOpen]);

  // Sidebar drag-resize handler
  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      document.body.classList.add("is-resizing-sidebar");

      const handleMove = (moveEvent) => {
        const nextWidth = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX)
        );
        setSidebarWidth(nextWidth);
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextWidth));
      };

      const handleEnd = () => {
        document.body.classList.remove("is-resizing-sidebar");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
        window.removeEventListener("pointercancel", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
      window.addEventListener("pointercancel", handleEnd);
    },
    [sidebarWidth]
  );

  return (
    <aside
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${SIDEBAR_MIN_WIDTH}px`,
        maxWidth: `${SIDEBAR_MAX_WIDTH}px`,
      }}
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--space-sidebar-border)] bg-[var(--surface-canvas)] select-none"
    >
      {/* Brand Header */}
      <div className="relative flex shrink-0 items-center justify-between border-b border-[var(--space-sidebar-border)] px-4 py-3.5">
        <button
          type="button"
          onClick={() => onSelect("chat")}
          className="font-display text-[20px] font-bold tracking-[-0.03em] text-foreground hover:opacity-85 transition-opacity"
        >
          Dori
        </button>

        <div ref={addMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-control bg-[var(--brand-primary)] text-white transition-transform hover:scale-105 active:scale-95 shadow-xs"
            title="Create or Quick Action"
            aria-label="Create Menu"
          >
            <Plus size={16} strokeWidth={2.2} />
          </button>

          {isAddMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-panel border border-border bg-card p-1.5 shadow-xl z-30 anim-rise">
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onNewNote?.();
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <FileText size={16} className="text-muted-foreground" />
                <span>New Note</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("tasks");
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Check size={16} className="text-muted-foreground" />
                <span>New Task</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("finance");
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Receipt size={16} className="text-muted-foreground" />
                <span>New Expense</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("entities");
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Users size={16} className="text-muted-foreground" />
                <span>New Entity</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("projects");
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <FolderKanban size={16} className="text-muted-foreground" />
                <span>New Project</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Scroll Region */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Search Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex min-h-[2.5rem] w-full items-center gap-2.5 rounded-control border border-[var(--space-sidebar-border)] bg-card px-3 py-1.5 text-left text-[14px] font-medium text-foreground transition-all hover:border-[var(--hairline-strong)] hover:bg-[var(--space-nav-hover)] shadow-2xs"
        >
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-foreground-secondary">
            Search
          </span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
            /
          </kbd>
        </button>

        {/* Primary Navigation Links */}
        <div className="flex flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className={cn(
                  "flex min-h-[2.5rem] w-full items-center gap-3 rounded-control px-3.5 py-2 text-left text-[15px] transition-all",
                  isActive
                    ? "bg-[var(--space-sidebar-field)] text-foreground font-semibold shadow-2xs"
                    : "text-foreground font-medium hover:bg-[var(--space-nav-hover)]"
                )}
              >
                <Icon
                  size={18}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive
                      ? "text-[var(--brand-primary)]"
                      : "text-muted-foreground"
                  )}
                  strokeWidth={1.8}
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {id === "inbox" && inboxCount > 0 && (
                  <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-accent-text)]">
                    {inboxCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Projects Accordion */}
        {projects.length > 0 && (
          <div className="pt-2 border-t border-[var(--space-sidebar-border)]">
            <button
              type="button"
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {projectsOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <span>Projects</span>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono font-bold text-foreground-secondary">
                {projects.length}
              </span>
            </button>

            {projectsOpen && (
              <div className="mt-1 flex flex-col gap-0.5 pl-0.5">
                {projects.map((node) => (
                  <ProjectRow
                    key={node.projectPath}
                    node={node}
                    selected={
                      active.startsWith("project:") ? active.slice(8) : null
                    }
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
        onSelectProfile={() => onSelect("profile")}
        profileVersion={profileVersion}
      />

      {/* Draggable Resize Boundary Handle */}
      <div
        className="sidebar-resize-handle"
        title="Drag to resize sidebar (double-click to reset)"
        onPointerDown={handleResizeStart}
        onDoubleClick={() => {
          setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
          localStorage.setItem(
            SIDEBAR_STORAGE_KEY,
            String(SIDEBAR_DEFAULT_WIDTH)
          );
        }}
      />
    </aside>
  );
}
