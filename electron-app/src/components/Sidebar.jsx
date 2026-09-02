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
  Sparkles,
  Layers,
} from "lucide-react";
import { cn } from "../lib/utils.js";

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_DEFAULT_WIDTH = 290;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_STORAGE_KEY = "dori.sidebar.width";

const SPACES_NAV = [
  {
    id: "work",
    label: "Work",
    items: [
      { id: "chat", label: "Composer & Chat", icon: SquarePen, space: "space-work" },
      { id: "inbox", label: "Inbox", icon: Inbox, space: "space-now" },
      { id: "tasks", label: "Tasks", icon: Check, space: "space-work" },
      { id: "projects", label: "Projects", icon: FolderKanban, space: "space-work" },
      { id: "finance", label: "Finance", icon: Receipt, space: "space-work" },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    items: [
      { id: "timeline", label: "Activity Timeline", icon: Clock, space: "space-knowledge" },
      { id: "entities", label: "Entities Directory", icon: Users, space: "space-knowledge" },
      { id: "library", label: "Vault Library", icon: Library, space: "space-knowledge" },
    ],
  },
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
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <div className="flex items-center gap-1 group">
        <button
          type="button"
          onClick={() => onSelect(node.projectPath)}
          className={cn(
            "group flex min-h-[2.15rem] flex-1 items-center gap-2 rounded-[10px] px-2.5 py-1 text-left text-[13px] tracking-[-0.01em] transition-all cursor-pointer",
            isSelected
              ? "bg-white/[0.08] text-white font-medium shadow-xs"
              : "text-white/70 font-normal hover:bg-white/[0.045] hover:text-white"
          )}
        >
          {depth === 0 ? (
            <Folder
              size={15}
              strokeWidth={1.55}
              className={cn(
                "shrink-0 transition-colors",
                isSelected ? "text-amber-400" : "text-white/50 group-hover:text-white/80"
              )}
            />
          ) : (
            <div className="flex items-center justify-center shrink-0 w-3.5 h-3.5">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  isSelected
                    ? "bg-amber-400 scale-125"
                    : "bg-white/40 group-hover:bg-white/70"
                )}
              />
            </div>
          )}
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
        </button>

        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <ChevronDown size={13} className={cn("transition-transform duration-150", !isOpen && "-rotate-90")} />
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-2.5 border-l border-white/[0.08] ml-3.5">
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
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, [profileVersion]);

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-[var(--space-sidebar-border)] p-2.5 bg-white/[0.01]">
      <button
        type="button"
        onClick={onSelectProfile}
        className="flex min-w-0 items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-white/[0.045] cursor-pointer flex-1"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/80 border border-white/10 font-semibold text-xs">
          {profile?.name ? profile.name.slice(0, 1).toUpperCase() : <User size={13} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white/90">
            {profile?.name || "Dori User"}
          </p>
          <p className="truncate text-[11px] text-white/40">
            {profile?.email || "Personal Vault"}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-white/50 hover:bg-white/[0.06] hover:text-white transition-colors"
        title="Settings (Cmd+,)"
      >
        <Settings size={14} strokeWidth={1.55} />
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return saved ? Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, parseInt(saved, 10))) : SIDEBAR_DEFAULT_WIDTH;
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  });

  const [inboxCount, setInboxCount] = useState(0);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [projects, setProjects] = useState([]);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const addMenuRef = useRef(null);

  useEffect(() => {
    window.dori
      ?.call("list_projects", {})
      .then((p) => setProjects(p || []))
      .catch(() => setProjects([]));

    window.dori
      ?.call("list_tasks", { status: "open" })
      .then((t) => setOpenTasksCount(t?.length || 0))
      .catch(() => setOpenTasksCount(0));
  }, [active]);

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

      const handleMove = (moveEvent) => {
        const nextWidth = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX)
        );
        setSidebarWidth(nextWidth);
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextWidth));
      };

      const handleEnd = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
    },
    [sidebarWidth]
  );

  const projectTree = buildProjectTree(projects);
  const displayedProjects = showAllProjects ? projectTree : projectTree.slice(0, 5);

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
      <div className="relative flex shrink-0 items-center justify-between border-b border-[var(--space-sidebar-border)] px-3.5 py-3">
        <button
          type="button"
          onClick={() => onSelect("chat")}
          className="font-display text-[17px] font-semibold tracking-[-0.02em] text-white/90 hover:text-white transition-colors"
        >
          Dori
        </button>

        <div ref={addMenuRef} className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-white/[0.08] hover:bg-white/[0.14] text-white/80 transition-colors shadow-xs"
            title="Create Menu"
            aria-label="Create Menu"
          >
            <Plus size={14} strokeWidth={2} />
          </button>

          {isAddMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 rounded-[10px] border border-white/10 bg-[#161922] p-1 shadow-2xl z-30 anim-rise">
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onNewNote?.();
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <FileText size={14} strokeWidth={1.55} className="text-amber-400" />
                <span>New Note</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("tasks");
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <Check size={14} strokeWidth={1.55} className="text-emerald-400" />
                <span>New Task</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("finance");
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <Receipt size={14} strokeWidth={1.55} className="text-amber-400" />
                <span>New Expense</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onSelect("projects");
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <FolderKanban size={14} strokeWidth={1.55} className="text-sky-400" />
                <span>New Project</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Scroll Region */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {/* Search Trigger Bar */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-8 w-full items-center justify-between rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12.5px] font-medium text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search size={13} strokeWidth={1.55} />
            <span>Search everything...</span>
          </div>
          <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/40 border border-white/10">
            ⌘K
          </kbd>
        </button>

        {/* Space Navigation Groups */}
        {SPACES_NAV.map((space) => (
          <div key={space.id} className="space-y-0.5">
            <div className="px-2 py-1 text-[11px] font-semibold text-white/35 uppercase tracking-wider">
              {space.label}
            </div>

            {space.items.map((item) => {
              const Icon = item.icon;
              const isSelected = active === item.id;
              const badgeCount =
                item.id === "inbox" ? inboxCount : item.id === "tasks" ? openTasksCount : 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "flex min-h-[2.15rem] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1 text-left text-[13px] tracking-[-0.01em] transition-all cursor-pointer",
                    isSelected
                      ? "bg-white/[0.08] text-white font-medium shadow-xs"
                      : "text-white/70 font-normal hover:bg-white/[0.045] hover:text-white"
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.55}
                    className={cn(
                      "shrink-0 transition-colors",
                      isSelected ? "text-amber-400" : "text-white/50 group-hover:text-white/80"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.2 text-[10.5px] font-semibold text-white/70 border border-white/10">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Projects Accordion Section */}
        <div className="space-y-1 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between px-2 py-1">
            <button
              type="button"
              onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-white/35 uppercase tracking-wider hover:text-white/60 transition-colors"
            >
              <ChevronDown
                size={12}
                className={cn("transition-transform duration-150", !isProjectsExpanded && "-rotate-90")}
              />
              <span>Projects ({projects.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onSelect("projects")}
              className="text-[11px] text-white/40 hover:text-amber-400 font-medium transition-colors"
            >
              View all
            </button>
          </div>

          {isProjectsExpanded && (
            <div className="space-y-0.5 pl-1">
              {displayedProjects.map((node) => (
                <ProjectRow
                  key={node.projectPath}
                  node={node}
                  selected={active.startsWith("project:") ? active.slice(8) : null}
                  onSelect={(path) => onSelect(`project:${path}`)}
                />
              ))}

              {projectTree.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllProjects(!showAllProjects)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                >
                  <span>{showAllProjects ? "Show fewer" : `See ${projectTree.length - 5} more...`}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile Footer */}
      <ProfileFooter
        onOpenSettings={onOpenSettings}
        onSelectProfile={() => onSelect("profile")}
        profileVersion={profileVersion}
      />

      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize z-20 hover:bg-amber-500/20 transition-colors"
        title="Drag to resize sidebar"
      />
    </aside>
  );
}
