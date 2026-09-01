import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Inbox as InboxIcon,
  Search,
  HelpCircle,
  FileText,
  RefreshCw,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { RouteHeader } from "./ui/RouteHeader.jsx";
import { Button } from "./ui/button.jsx";
import { EmptyState } from "./ui/empty-state.jsx";
import { FilterChip } from "./ui/filter-chip.jsx";
import { Input } from "./ui/input.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.jsx";
import { Skeleton } from "./ui/skeleton.jsx";
import { cn } from "../lib/utils.js";

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

const INBOX_TYPES = [
  { id: "all", label: "All" },
  { id: "clarification", label: "Clarifications" },
  { id: "inbox_file", label: "Files" },
];

export function InboxView({ onSelectDocument }) {
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedChoices, setSelectedChoices] = useState({});
  const [processingIds, setProcessingIds] = useState(new Set());

  const refresh = useCallback(() => {
    setLoading(true);
    window.dori
      ?.call("list_inbox", {})
      .then((items) => {
        setInbox(items || []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleChoiceChange = useCallback((clarificationId, choiceId) => {
    setSelectedChoices((prev) => ({
      ...prev,
      [clarificationId]: choiceId,
    }));
  }, []);

  const decide = useCallback(
    async (actionId, clarificationId, choiceId) => {
      setProcessingIds((prev) => new Set(prev).add(clarificationId));
      try {
        await window.dori?.call(actionId, { clarificationId, choiceId });
        refresh();
      } catch (e) {
        setError(e.message);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(clarificationId);
          return next;
        });
      }
    },
    [refresh]
  );

  const counts = useMemo(() => {
    if (!inbox) return { all: 0, clarification: 0, inbox_file: 0 };
    return {
      all: inbox.length,
      clarification: inbox.filter((i) => i.type === "clarification").length,
      inbox_file: inbox.filter((i) => i.type === "inbox_file").length,
    };
  }, [inbox]);

  const filtered = useMemo(() => {
    if (!inbox) return null;
    const q = query.trim().toLowerCase();
    return inbox
      .filter((item) => type === "all" || item.type === type)
      .filter(
        (item) =>
          !q ||
          item.title?.toLowerCase().includes(q) ||
          item.domain?.toLowerCase().includes(q) ||
          item.relPath?.toLowerCase().includes(q)
      );
  }, [inbox, type, query]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-4xl space-y-6">
        <RouteHeader
          title="Inbox"
          description="Everything waiting on you — approve destinations, file captures, or resolve clarifications."
          meta={
            inbox?.length > 0 ? (
              <span className="rounded-full bg-[var(--surface-tint)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-accent-text)]">
                {inbox.length} {inbox.length === 1 ? "item" : "items"} waiting
              </span>
            ) : null
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw
                size={13}
                className={cn(loading && "animate-spin")}
              />
              <span>Refresh</span>
            </Button>
          }
        />

        {/* Filter Chips and Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {INBOX_TYPES.map((t) => {
              const count = counts[t.id] ?? 0;
              return (
                <FilterChip
                  key={t.id}
                  selected={type === t.id}
                  onClick={() => setType(t.id)}
                >
                  <span>{t.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      type === t.id ? "bg-background/20 text-background" : "bg-muted-foreground/15 text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </FilterChip>
              );
            })}
          </div>

          <div className="relative max-w-xs flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search inbox captures…"
              className="h-8 pl-8 text-xs bg-card border-border-soft rounded-control"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Error notice */}
        {error && (
          <div className="rounded-panel border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setError(null)}
              className="h-6 px-2 text-xs"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && !inbox && (
          <div className="space-y-3 anim-stagger">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="universal-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6"
              >
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20 rounded-pill" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-32 rounded-control" />
                  <Skeleton className="h-8 w-16 rounded-control" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered && filtered.length === 0 && (
          <EmptyState
            icon={InboxIcon}
            title={
              inbox?.length === 0
                ? "Inbox zero — nothing waiting"
                : "No matching inbox items"
            }
            description={
              inbox?.length === 0
                ? "When captures require routing, meetings need confirmation, or documents are filed without a destination, they appear here."
                : "No items match your active filters and search query."
            }
            action={
              inbox?.length === 0
                ? {
                    label: "Check Again",
                    onClick: refresh,
                  }
                : {
                    label: "Clear Filters",
                    onClick: () => {
                      setType("all");
                      setQuery("");
                    },
                  }
            }
          />
        )}

        {/* Inbox Items List */}
        {filtered && filtered.length > 0 && (
          <div className="space-y-3.5 anim-stagger">
            {filtered.map((item) => {
              const isClarification = item.type === "clarification";
              const Icon = isClarification ? HelpCircle : FileText;
              const isProcessing =
                item.clarificationId && processingIds.has(item.clarificationId);
              const currentChoice =
                item.clarificationId &&
                (selectedChoices[item.clarificationId] ||
                  item.candidates?.[0]?.id ||
                  "");

              return (
                <div
                  key={item.clarificationId || item.relPath || item.title}
                  className="universal-card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-primary shadow-xs">
                    <Icon
                      className="h-6 w-6 text-[var(--brand-primary)]"
                      strokeWidth={1.75}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {item.type ? item.type.replace("_", " ") : "Item"}
                      </span>
                      {item.domain && (
                        <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-accent-text)]">
                          {item.domain}
                        </span>
                      )}
                      {item.createdAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-[16px] font-semibold text-foreground leading-snug">
                      {item.title}
                    </h3>

                    {item.relPath && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground truncate">
                        {item.relPath}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex w-full shrink-0 flex-wrap items-center gap-2.5 sm:mt-0 sm:w-auto">
                    {isClarification && item.clarificationId && (
                      <>
                        {item.candidates?.length > 0 && (
                          <Select
                            value={currentChoice}
                            onValueChange={(val) =>
                              handleChoiceChange(item.clarificationId, val)
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="w-52 bg-card border-border-soft text-xs"
                            >
                              <SelectValue placeholder="Choose destination…" />
                            </SelectTrigger>
                            <SelectContent>
                              {item.candidates.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <div className="flex flex-col py-0.5">
                                    <span className="font-medium text-xs">
                                      {c.label}
                                    </span>
                                    {c.detail && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {c.detail}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        <Button
                          size="sm"
                          disabled={isProcessing}
                          onClick={() =>
                            decide(
                              "approve_inbox_item",
                              item.clarificationId,
                              currentChoice
                            )
                          }
                          className="gap-1.5"
                        >
                          <Check size={13} strokeWidth={2.5} />
                          <span>Approve</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isProcessing}
                          className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                          onClick={() =>
                            decide("ignore_inbox_item", item.clarificationId)
                          }
                        >
                          <X size={13} />
                          <span>Dismiss</span>
                        </Button>
                      </>
                    )}

                    {!isClarification && item.relPath && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectDocument?.(item.relPath)}
                        className="gap-1.5"
                      >
                        <ExternalLink size={13} />
                        <span>Preview File</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
