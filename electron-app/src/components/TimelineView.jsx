import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Compass,
  CheckCircle2,
  Receipt,
  Search,
  RefreshCw,
  FileText,
  Copy,
  Check,
  X,
  Clock,
  Filter,
  ChevronRight,
  Video,
  Building2,
  Users,
} from "lucide-react";
import { RouteHeader } from "./ui/RouteHeader.jsx";
import { Badge } from "./ui/badge.jsx";
import { Button } from "./ui/button.jsx";
import { EmptyState } from "./ui/empty-state.jsx";
import { FilterChip } from "./ui/filter-chip.jsx";
import { Input } from "./ui/input.jsx";
import { Skeleton } from "./ui/skeleton.jsx";
import { api } from "../lib/api.js";
import { cn } from "../lib/utils.js";

const KIND_FILTERS = [
  { id: "all", label: "All" },
  { id: "meeting", label: "Meetings" },
  { id: "decision", label: "Decisions" },
  { id: "expense", label: "Expenses" },
  { id: "task", label: "Tasks" },
];

const KIND_CONFIG = {
  meeting: {
    label: "Meeting",
    pluralLabel: "Meetings",
    icon: Video,
    color: "text-indigo-700 dark:text-indigo-300",
    bgTint: "bg-indigo-50 dark:bg-indigo-950/50",
    borderTint: "border-indigo-200 dark:border-indigo-800",
    badgeClasses:
      "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-200 dark:border-indigo-700",
    cardAccent: "border-l-4 border-l-indigo-600",
  },
  decision: {
    label: "Decision",
    pluralLabel: "Decisions",
    icon: Compass,
    color: "text-amber-700 dark:text-amber-300",
    bgTint: "bg-amber-50 dark:bg-amber-950/50",
    borderTint: "border-amber-200 dark:border-amber-800",
    badgeClasses:
      "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700",
    cardAccent: "border-l-4 border-l-amber-500",
  },
  task: {
    label: "Task",
    pluralLabel: "Tasks",
    icon: CheckCircle2,
    color: "text-blue-700 dark:text-blue-300",
    bgTint: "bg-blue-50 dark:bg-blue-950/50",
    borderTint: "border-blue-200 dark:border-blue-800",
    badgeClasses:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700",
    cardAccent: "border-l-4 border-l-blue-600",
  },
  expense: {
    label: "Expense",
    pluralLabel: "Expenses",
    icon: Receipt,
    color: "text-emerald-700 dark:text-emerald-300",
    bgTint: "bg-emerald-50 dark:bg-emerald-950/50",
    borderTint: "border-emerald-200 dark:border-emerald-800",
    badgeClasses:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
    cardAccent: "border-l-4 border-l-emerald-600",
  },
  note: {
    label: "Note",
    pluralLabel: "Notes",
    icon: FileText,
    color: "text-purple-700 dark:text-purple-300",
    bgTint: "bg-purple-50 dark:bg-purple-950/50",
    borderTint: "border-purple-200 dark:border-purple-800",
    badgeClasses:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/60 dark:text-purple-200 dark:border-purple-700",
    cardAccent: "border-l-4 border-l-purple-600",
  },
};

const BUCKET_ORDER = ["Today", "Yesterday", "This Week", "Last Week", "Earlier"];

function parseEventDate(iso) {
  if (!iso) return null;
  try {
    if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function getDateBucket(iso) {
  const itemDate = parseEventDate(iso);
  if (!itemDate) return "Earlier";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const normalizedItemDate = new Date(
    itemDate.getFullYear(),
    itemDate.getMonth(),
    itemDate.getDate()
  );

  const diffTime = today.getTime() - normalizedItemDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  // Calculate start of current week (Monday)
  const currentDay = today.getDay();
  const daysSinceMonday = (currentDay + 6) % 7;
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - daysSinceMonday);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  if (normalizedItemDate >= startOfThisWeek && diffDays > 1) {
    return "This Week";
  }
  if (
    normalizedItemDate >= startOfLastWeek &&
    normalizedItemDate < startOfThisWeek
  ) {
    return "Last Week";
  }
  return "Earlier";
}

function formatDisplayDate(iso) {
  const d = parseEventDate(iso);
  if (!d) return String(iso || "");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TimelineView({ onOpenFile, onSelectDocument }) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedRef, setCopiedRef] = useState(null);

  const handleOpenTarget = useCallback(
    (ref) => {
      if (!ref) return;
      if (onOpenFile) {
        onOpenFile(ref);
      } else if (onSelectDocument) {
        onSelectDocument(ref);
      }
    },
    [onOpenFile, onSelectDocument]
  );

  const handleCopyRef = useCallback((e, ref) => {
    e.stopPropagation();
    if (!ref) return;
    navigator.clipboard?.writeText(ref).catch(() => {});
    setCopiedRef(ref);
    setTimeout(() => {
      setCopiedRef((current) => (current === ref ? null : current));
    }, 1800);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    api.getTimeline({ limit: 100 })
      .then((items) => {
        setEvents(items || []);
        setError(null);
      })
      .catch((e) => {
        setEvents([]);
        setError(e?.message || "Failed to load timeline events.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Compute event counts for filter chips
  const counts = useMemo(() => {
    const res = { all: 0, meeting: 0, decision: 0, expense: 0, task: 0 };
    if (!events) return res;
    res.all = events.length;
    for (const e of events) {
      if (res[e.kind] !== undefined) {
        res[e.kind]++;
      }
    }
    return res;
  }, [events]);

  // Filter and search
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    const query = searchQuery.trim().toLowerCase();

    return events.filter((e) => {
      if (kindFilter !== "all" && e.kind !== kindFilter) {
        return false;
      }
      if (query) {
        const matchLabel = (e.label || "").toLowerCase().includes(query);
        const matchRef = (e.ref || "").toLowerCase().includes(query);
        const matchKind = (e.kind || "").toLowerCase().includes(query);
        const matchDate = (e.date || "").toLowerCase().includes(query);
        if (!matchLabel && !matchRef && !matchKind && !matchDate) {
          return false;
        }
      }
      return true;
    });
  }, [events, kindFilter, searchQuery]);

  // Group events chronologically by date bucket
  const groupedEvents = useMemo(() => {
    const buckets = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      "Last Week": [],
      Earlier: [],
    };

    for (const item of filteredEvents) {
      const bucket = getDateBucket(item.date);
      if (buckets[bucket]) {
        buckets[bucket].push(item);
      } else {
        buckets.Earlier.push(item);
      }
    }

    return BUCKET_ORDER.map((bucket) => ({
      bucket,
      items: buckets[bucket] || [],
    })).filter((group) => group.items.length > 0);
  }, [filteredEvents]);

  const hasActiveFilters = kindFilter !== "all" || searchQuery.trim() !== "";

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-5xl space-y-6">
        {/* Route Header */}
        <RouteHeader
          title="Timeline"
          description="Chronological stream of meetings, architectural decisions, task completions, and expenses."
          meta={
            events && events.length > 0 ? (
              <Badge
                variant="muted"
                size="compact"
                className="text-xs font-semibold font-mono"
              >
                {events.length} {events.length === 1 ? "event" : "events"}
              </Badge>
            ) : null
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="gap-2 text-xs font-medium"
            >
              <RefreshCw
                size={13}
                className={cn(loading && "animate-spin text-muted-foreground")}
              />
              <span>Refresh</span>
            </Button>
          }
        />

        {/* Filter Chips & Text Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-4">
          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {KIND_FILTERS.map((f) => {
              const count = counts[f.id] || 0;
              const isSelected = kindFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setKindFilter(f.id)}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all border flex items-center gap-2 cursor-pointer",
                    isSelected
                      ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] font-bold shadow-xs"
                      : "bg-card text-foreground-secondary border-border hover:bg-[var(--space-nav-hover)] hover:text-foreground"
                  )}
                >
                  <span>{f.label}</span>
                  {events && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-mono leading-none transition-colors",
                        isSelected
                          ? "bg-white/25 text-white"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Text Search Input */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search timeline or ref…"
              className="h-10 pl-9 pr-8 text-sm bg-card border-border rounded-lg transition-all focus:border-[var(--brand-primary)] font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full transition-colors"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-panel border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && !events && (
          <div className="space-y-6 anim-stagger">
            {[1, 2].map((g) => (
              <div key={g} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="universal-card p-4.5 flex items-center gap-4"
                    >
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-16 rounded-full" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-4.5 w-3/4" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <Skeleton className="h-8 w-20 rounded-control shrink-0 hidden sm:block" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty States */}
        {!loading && filteredEvents.length === 0 && (
          <EmptyState
            icon={hasActiveFilters ? Filter : Clock}
            title={
              events?.length === 0
                ? "No timeline activity yet"
                : "No matching timeline events"
            }
            description={
              events?.length === 0
                ? "Activities such as filed meetings, logged decisions, completed tasks, and recorded expenses will appear here chronologically."
                : "No timeline items match your selected filter or search criteria."
            }
            action={
              hasActiveFilters
                ? {
                    label: "Reset Filters",
                    onClick: () => {
                      setKindFilter("all");
                      setSearchQuery("");
                    },
                  }
                : undefined
            }
          />
        )}

        {/* Chronologically Grouped Event List */}
        {!loading && groupedEvents.length > 0 && (
          <div className="space-y-8 anim-stagger">
            {groupedEvents.map((group) => (
              <section key={group.bucket} className="space-y-3">
                {/* Date Group Heading */}
                <div className="flex items-center gap-2.5 px-0.5">
                  <h2 className="font-display text-sm font-bold tracking-tight text-foreground">
                    {group.bucket}
                  </h2>
                  <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "event" : "events"}
                  </span>
                  <div className="flex-1 h-px bg-border-soft/80 ml-2" />
                </div>

                {/* Event Cards in Group */}
                <div className="space-y-2.5">
                  {group.items.map((item, index) => {
                    const cfg = KIND_CONFIG[item.kind] || {
                      label: item.kind || "Event",
                      icon: Clock,
                      color: "text-muted-foreground",
                      bgTint: "bg-muted text-muted-foreground",
                      borderTint: "border-border",
                      badgeClasses: "bg-muted text-muted-foreground",
                    };
                    const Icon = cfg.icon;
                    const isCopied = copiedRef === item.ref;
                    const canNavigate = Boolean(
                      item.ref && (onOpenFile || onSelectDocument)
                    );

                    return (
                      <div
                        key={`${item.date}-${item.kind}-${item.ref || index}-${index}`}
                        onClick={() => {
                          if (canNavigate) {
                            handleOpenTarget(item.ref);
                          }
                        }}
                        className={cn(
                          "rounded-xl border border-border bg-card p-4.5 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all group shadow-xs",
                          cfg.cardAccent,
                          canNavigate &&
                            "cursor-pointer hover:border-foreground/25 hover:shadow-md active:scale-[0.995]"
                        )}
                      >
                        {/* Left: Icon & Details */}
                        <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                          <div
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-xs transition-transform group-hover:scale-105",
                              cfg.bgTint,
                              cfg.borderTint
                            )}
                          >
                            <Icon
                              className={cn("h-5 w-5", cfg.color)}
                              strokeWidth={2.2}
                            />
                          </div>

                          <div className="min-w-0 flex-1 space-y-1.5">
                            {/* Metadata Badges Row */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider border shadow-2xs",
                                  cfg.badgeClasses
                                )}
                              >
                                {cfg.label}
                              </span>

                              {item.date && (
                                <span className="text-[13px] text-muted-foreground font-semibold">
                                  {formatDisplayDate(item.date)}
                                </span>
                              )}

                              {item.org && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md bg-muted text-foreground border border-border">
                                  <Building2 size={12} className="text-muted-foreground" />
                                  <span>{item.org}</span>
                                </span>
                              )}

                              {item.amount && (
                                <span className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ${item.amount}
                                </span>
                              )}

                              {item.attendees && item.attendees.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-semibold">
                                  <Users size={12} />
                                  <span>{item.attendees.length} attendee{item.attendees.length === 1 ? '' : 's'}</span>
                                </span>
                              )}
                            </div>

                            {/* Label / Activity Summary */}
                            <p className="text-[15.5px] font-bold text-foreground leading-snug group-hover:text-[var(--brand-primary)] transition-colors tracking-tight">
                              {item.label || "Activity Event"}
                            </p>

                            {/* Document / File Reference */}
                            {item.ref && (
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-foreground bg-muted/80 border border-border px-2.5 py-1 rounded-md max-w-full truncate">
                                  <FileText
                                    size={13}
                                    className="shrink-0 text-muted-foreground"
                                  />
                                  <span className="truncate">{item.ref}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                          {item.ref && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleCopyRef(e, item.ref)}
                              className="h-8 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                              title="Copy File Reference"
                            >
                              {isCopied ? (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <Check size={14} />
                                  <span>Copied</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Copy size={14} />
                                  <span className="hidden sm:inline">Copy Ref</span>
                                </span>
                              )}
                            </Button>
                          )}

                          {/* Open Document Button */}
                          {canNavigate && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenTarget(item.ref)}
                              className="h-8 px-3 text-xs gap-1 font-bold bg-card hover:bg-muted border-border"
                            >
                              <span>Open</span>
                              <ChevronRight
                                size={14}
                                className="text-muted-foreground"
                              />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
