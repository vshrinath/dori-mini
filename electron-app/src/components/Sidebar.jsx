import { useEffect, useState, useRef, useCallback } from "react";
import {
  Inbox,
  Check,
  Folder,
  ChevronDown,
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
  Key,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { api } from "../lib/api.js";
import { cn } from "../lib/utils.js";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./ui/tooltip.jsx";

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_DEFAULT_WIDTH = 272;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_STORAGE_KEY = "dori.sidebar.width";
const SIDEBAR_COLLAPSED_KEY = "dori.sidebar.collapsed";
const SIDEBAR_EXPANDED_GROUPS_KEY = "dori.sidebar.expanded_groups";

export const SPACES_NAV = [
  {
    id: "work",
    label: "Work",
    space: "space-work",
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
    space: "space-knowledge",
    items: [
      { id: "timeline", label: "Activity Timeline", icon: Clock, space: "space-knowledge" },
      { id: "entities", label: "Entities Directory", icon: Users, space: "space-knowledge" },
      { id: "library", label: "Vault Library", icon: Library, space: "space-knowledge" },
    ],
  },
  {
    id: "system",
    label: "System",
    space: "space-system",
    items: [
      { id: "profile", label: "Profile", icon: User, space: "space-system" },
      { id: "credentials", label: "Credentials Vault", icon: Key, space: "space-system", isModal: true },
      { id: "settings", label: "Settings", icon: Settings, space: "space-system", isModal: true },
    ],
  },
];

function getSpaceAccentClass(spaceToken, isSelected) {
  if (!isSelected) return "text-muted-foreground group-hover:text-foreground";
  switch (spaceToken) {
    case "space-now":
      return "text-space-now";
    case "space-work":
      return "text-space-work";
    case "space-knowledge":
      return "text-space-knowledge";
    case "space-system":
      return "text-space-system";
    case "space-create":
      return "text-space-create";
    case "space-personal":
      return "text-space-personal";
    default:
      return "text-space-now";
  }
}

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
              ? "bg-foreground/[0.08] text-foreground font-semibold shadow-xs"
              : "text-foreground-secondary font-medium hover:bg-foreground/[0.045] hover:text-foreground"
          )}
        >
          {depth === 0 ? (
            <Folder
              size={15}
              strokeWidth={1.55}
              className={cn(
                "shrink-0 transition-colors",
                isSelected ? "text-space-now" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
          ) : (
            <div className="flex items-center justify-center shrink-0 w-3.5 h-3.5">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  isSelected
                    ? "bg-space-now scale-125"
                    : "bg-muted-foreground/50 group-hover:bg-foreground"
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
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronDown size={13} className={cn("transition-transform duration-150", !isOpen && "-rotate-90")} />
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-2.5 border-l border-border/60 ml-3.5">
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
    api.getProfile()
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, [profileVersion]);

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border p-2 bg-foreground/[0.01]">
      <button
        type="button"
        onClick={onSelectProfile}
        className="flex min-w-0 items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-foreground/[0.045] cursor-pointer flex-1 group"
      >
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-foreground border border-border font-semibold text-xs transition-transform group-hover:scale-105">
          {profile?.name ? profile.name.slice(0, 1).toUpperCase() : <User size={15} strokeWidth={1.55} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
            {profile?.name || "Dori User"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
            {profile?.email || profile?.role || "Personal Vault"}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors cursor-pointer"
        title="Settings (Cmd+,)"
      >
        <Settings size={14} strokeWidth={1.55} />
      </button>
    </div>
  );
}

function CollapsedRail({
  active,
  onSelect,
  onExpand,
  onOpenSearch,
  onOpenSettings,
  onOpenCredentials,
  inboxCount,
  openTasksCount,
  profile,
}) {
  const railItems = [
    { id: "chat", label: "Composer & Chat", icon: SquarePen, space: "space-work" },
    { id: "inbox", label: "Inbox", icon: Inbox, space: "space-now", count: inboxCount },
    { id: "tasks", label: "Tasks", icon: Check, space: "space-work", count: openTasksCount },
    { id: "projects", label: "Projects", icon: FolderKanban, space: "space-work" },
    { id: "finance", label: "Finance", icon: Receipt, space: "space-work" },
    { type: "divider" },
    { id: "timeline", label: "Activity Timeline", icon: Clock, space: "space-knowledge" },
    { id: "entities", label: "Entities Directory", icon: Users, space: "space-knowledge" },
    { id: "library", label: "Vault Library", icon: Library, space: "space-knowledge" },
    { type: "divider" },
    { id: "credentials", label: "Credentials Vault", icon: Key, space: "space-system", isModal: true },
  ];

  return (
    <aside
      className="flex h-full w-[40px] shrink-0 flex-col items-center justify-between border-r border-border bg-[var(--surface-canvas)] py-2 select-none z-20"
      aria-label="Navigation Rail"
    >
      {/* Top action cluster */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Expand button */}
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={onExpand}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors cursor-pointer"
              aria-label="Expand Sidebar (Cmd+\)"
            >
              <ChevronsRight size={15} strokeWidth={1.55} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar (⌘\)</TooltipContent>
        </Tooltip>

        {/* Quick Search */}
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors cursor-pointer"
              aria-label="Search everything (Cmd+K)"
            >
              <Search size={14} strokeWidth={1.55} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Search everything (⌘K)</TooltipContent>
        </Tooltip>

        <div className="h-px w-5 bg-border my-0.5" />

        {/* Primary nav icons */}
        <div className="flex flex-col items-center gap-1 w-full px-1">
          {railItems.map((item, idx) => {
            if (item.type === "divider") {
              return <div key={idx} className="h-px w-4 bg-border/60 my-0.5" />;
            }
            const Icon = item.icon;
            const isSelected = active === item.id || (item.id === "projects" && active.startsWith("project:"));
            const accentClass = getSpaceAccentClass(item.space, isSelected);

            const handleClick = () => {
              if (item.id === "settings") onOpenSettings?.();
              else if (item.id === "credentials") onOpenCredentials?.();
              else onSelect(item.id);
            };

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger>
                  <button
                    type="button"
                    onClick={handleClick}
                    className={cn(
                      "relative flex h-7 w-7 items-center justify-center rounded-[8px] transition-all cursor-pointer",
                      isSelected
                        ? "bg-foreground/[0.08] text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground"
                    )}
                    aria-label={item.label}
                  >
                    <Icon size={15} strokeWidth={1.55} className={accentClass} />
                    {item.count > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-space-now" />
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-space-now" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Bottom utility cluster */}
      <div className="flex flex-col items-center gap-1.5 w-full pt-2 border-t border-border">
        {/* Profile Avatar */}
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={() => onSelect("profile")}
              className={cn(
                "flex h-[32px] w-[32px] items-center justify-center rounded-full border border-border bg-foreground/[0.08] text-foreground font-semibold text-xs hover:scale-105 transition-transform cursor-pointer",
                active === "profile" && "ring-2 ring-primary/50"
              )}
              aria-label="Profile"
            >
              {profile?.name ? profile.name.slice(0, 1).toUpperCase() : <User size={14} strokeWidth={1.55} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{profile?.name || "Profile"}</TooltipContent>
        </Tooltip>

        {/* Settings button */}
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors cursor-pointer"
              aria-label="Settings (Cmd+,)"
            >
              <Settings size={14} strokeWidth={1.55} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings (⌘,)</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

export function Sidebar({
  active,
  onSelect,
  onOpenSearch,
  onOpenSettings,
  onOpenCredentials,
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

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_EXPANDED_GROUPS_KEY);
      return saved ? JSON.parse(saved) : { work: true, knowledge: true, system: true, projects: true };
    } catch {
      return { work: true, knowledge: true, system: true, projects: true };
    }
  });

  const [profile, setProfile] = useState(undefined);
  const [inboxCount, setInboxCount] = useState(0);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [projects, setProjects] = useState([]);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const addMenuRef = useRef(null);

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(SIDEBAR_EXPANDED_GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleSetCollapsed = useCallback((collapsed) => {
    setIsCollapsed(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {}
  }, []);

  // Global shortcut Cmd+\ to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        handleSetCollapsed(!isCollapsed);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCollapsed, handleSetCollapsed]);

  // Auto-expand group if active child is present
  useEffect(() => {
    for (const space of SPACES_NAV) {
      if (space.items.some((item) => item.id === active)) {
        if (!expandedGroups[space.id]) {
          setExpandedGroups((prev) => ({ ...prev, [space.id]: true }));
        }
      }
    }
    if (active.startsWith("project:") && !expandedGroups.projects) {
      setExpandedGroups((prev) => ({ ...prev, projects: true }));
    }
  }, [active, expandedGroups]);

  useEffect(() => {
    api.getProfile()
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, [profileVersion]);

  useEffect(() => {
    api.listProjects()
      .then((p) => setProjects(p || []))
      .catch(() => setProjects([]));

    api.listTasks('open')
      .then((t) => setOpenTasksCount(t?.length || 0))
      .catch(() => setOpenTasksCount(0));
  }, [active]);

  useEffect(() => {
    api.listInbox()
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
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextWidth));
        } catch {}
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
  const displayedProjects = showAllProjects ? projectTree : projectTree.slice(0, 6);

  if (isCollapsed) {
    return (
      <CollapsedRail
        active={active}
        onSelect={onSelect}
        onExpand={() => handleSetCollapsed(false)}
        onOpenSearch={onOpenSearch}
        onOpenSettings={onOpenSettings}
        onOpenCredentials={onOpenCredentials}
        inboxCount={inboxCount}
        openTasksCount={openTasksCount}
        profile={profile}
      />
    );
  }

  return (
    <aside
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${SIDEBAR_MIN_WIDTH}px`,
        maxWidth: `${SIDEBAR_MAX_WIDTH}px`,
      }}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-[var(--surface-canvas)] select-none"
    >
      {/* Brand Header */}
      <div className="relative flex shrink-0 items-center justify-between border-b border-border px-3.5 py-3">
        <button
          type="button"
          onClick={() => onSelect("chat")}
          className="font-display text-[18px] font-bold tracking-[-0.02em] text-foreground hover:opacity-85 transition-opacity cursor-pointer"
        >
          Dori
        </button>

        <div className="flex items-center gap-1">
          {/* Create Menu */}
          <div ref={addMenuRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-foreground/[0.08] hover:bg-foreground/[0.14] text-foreground transition-colors shadow-xs cursor-pointer"
              title="Create Menu"
              aria-label="Create Menu"
            >
              <Plus size={14} strokeWidth={2} />
            </button>

            {isAddMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-[10px] border border-border bg-card p-1 shadow-2xl z-30 anim-rise">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onNewNote?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <FileText size={14} strokeWidth={1.55} className="text-space-now" />
                  <span>New Note</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onSelect("tasks");
                  }}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Check size={14} strokeWidth={1.55} className="text-emerald-500" />
                  <span>New Task</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onSelect("finance");
                  }}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Receipt size={14} strokeWidth={1.55} className="text-space-now" />
                  <span>New Expense</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onSelect("projects");
                  }}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <FolderKanban size={14} strokeWidth={1.55} className="text-sky-500" />
                  <span>New Project</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapse button */}
          <button
            type="button"
            onClick={() => handleSetCollapsed(true)}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground transition-colors cursor-pointer"
            title="Collapse sidebar (Cmd+\)"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft size={14} strokeWidth={1.55} />
          </button>
        </div>
      </div>

      {/* Navigation Scroll Region */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3.5">
        {/* Search Trigger Bar */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-8 w-full items-center justify-between rounded-[8px] border border-border bg-foreground/[0.02] px-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search size={13} strokeWidth={1.55} />
            <span>Search everything...</span>
          </div>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
            ⌘K
          </kbd>
        </button>

        {/* Space Navigation Groups (Accordions) */}
        {SPACES_NAV.map((space) => {
          const isExpanded = expandedGroups[space.id] ?? true;

          return (
            <div key={space.id} className="space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(space.id)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer select-none"
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    className={cn(
                      "transition-transform duration-200",
                      !isExpanded && "-rotate-90 text-muted-foreground/50"
                    )}
                  />
                  <span>{space.label}</span>
                </button>
              </div>

              {isExpanded && (
                <div className="space-y-0.5 anim-rise">
                  {space.items.map((item) => {
                    const Icon = item.icon;
                    const isSelected = active === item.id;
                    const badgeCount =
                      item.id === "inbox" ? inboxCount : item.id === "tasks" ? openTasksCount : 0;
                    const accentClass = getSpaceAccentClass(item.space, isSelected);

                    const handleClick = () => {
                      if (item.id === "settings") {
                        onOpenSettings?.();
                      } else if (item.id === "credentials") {
                        onOpenCredentials?.();
                      } else {
                        onSelect(item.id);
                      }
                    };

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={handleClick}
                        className={cn(
                          "group flex min-h-[2.15rem] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1 text-left text-[13px] tracking-[-0.01em] transition-all cursor-pointer",
                          isSelected
                            ? "bg-foreground/[0.08] text-foreground font-semibold shadow-xs"
                            : "text-foreground-secondary font-medium hover:bg-foreground/[0.045] hover:text-foreground"
                        )}
                      >
                        <Icon
                          size={16}
                          strokeWidth={1.55}
                          className={cn("shrink-0 transition-colors", accentClass)}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className="rounded bg-muted px-1.5 py-0.2 text-[10.5px] font-semibold text-foreground-secondary border border-border">
                            {badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Projects Accordion Section */}
        <div className="space-y-1 pt-2 border-t border-border">
          <div className="flex items-center justify-between px-2 py-1">
            <button
              type="button"
              onClick={() => toggleGroup("projects")}
              className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer select-none"
            >
              <ChevronDown
                size={12}
                strokeWidth={2}
                className={cn(
                  "transition-transform duration-200",
                  !expandedGroups.projects && "-rotate-90 text-muted-foreground/50"
                )}
              />
              <span>Projects ({projects.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onSelect("projects")}
              className="text-[11px] text-muted-foreground hover:text-space-now font-medium transition-colors cursor-pointer"
            >
              View all
            </button>
          </div>

          {expandedGroups.projects && (
            <div className="space-y-0.5 pl-1 anim-rise">
              {displayedProjects.map((node) => (
                <ProjectRow
                  key={node.projectPath}
                  node={node}
                  selected={active.startsWith("project:") ? active.slice(8) : null}
                  onSelect={(path) => onSelect(`project:${path}`)}
                />
              ))}

              {projectTree.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllProjects(!showAllProjects)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <span>{showAllProjects ? "Show fewer" : `See ${projectTree.length - 6} more...`}</span>
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
        className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize z-20 hover:bg-[var(--space-work)]/20 transition-colors"
        title="Drag to resize sidebar"
      />
    </aside>
  );
}
