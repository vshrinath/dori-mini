import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  Receipt,
  Plus,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Check,
  FileText,
  Sparkles,
  Send,
  UploadCloud,
  X,
  Search,
  DollarSign,
  Calendar,
  CreditCard,
  Tag,
  ChevronRight,
  Layers,
  FileCheck,
  Eye,
  ExternalLink,
  Paperclip,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  CheckCheck
} from "lucide-react";
import { RouteHeader } from "./ui/RouteHeader.jsx";
import { Badge } from "./ui/badge.jsx";
import { Button } from "./ui/button.jsx";
import { EmptyState } from "./ui/empty-state.jsx";
import { FilterChip } from "./ui/filter-chip.jsx";
import { Skeleton } from "./ui/skeleton.jsx";
import { cn } from "../lib/utils.js";

const STATUS_TABS = [
  { id: "all", label: "All Ledgers" },
  { id: "draft", label: "Drafts" },
  { id: "submitted", label: "Submitted" },
  { id: "paid", label: "Paid" },
];

const CATEGORIES = [
  "Travel",
  "Food",
  "Transport",
  "Lodging",
  "Office",
  "Software",
  "Entertainment",
  "Other",
];

function formatCurrency(val) {
  if (val == null || isNaN(Number(val))) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val));
}

export function FinanceView({ onSelectDocument }) {
  const [ledgers, setLedgers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [selectedLedgerTarget, setSelectedLedgerTarget] = useState(null);
  const [gapModalTarget, setGapModalTarget] = useState(null);
  const [closeTripLedger, setCloseTripLedger] = useState(null);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [attachInitialTrip, setAttachInitialTrip] = useState("");

  // Refresh ledgers list
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    window.dori
      ?.call("list_trip_ledgers", {})
      .then((items) => {
        setLedgers(items || []);
        setError(null);
      })
      .catch((err) => {
        console.warn("Failed to load trip ledgers:", err);
        setLedgers([]);
        setError(err.message || "Failed to load trip ledgers");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Aggregated metrics
  const metrics = useMemo(() => {
    if (!ledgers || ledgers.length === 0) {
      return {
        totalSpent: 0,
        reimbursableTotal: 0,
        activeTrips: 0,
        paidTrips: 0,
        incompleteCount: 0,
      };
    }
    return ledgers.reduce(
      (acc, item) => {
        acc.totalSpent += Number(item.total) || 0;
        acc.reimbursableTotal += Number(item.reimbursableTotal) || 0;
        if (item.status === "paid") {
          acc.paidTrips += 1;
        } else {
          acc.activeTrips += 1;
        }
        acc.incompleteCount += Number(item.incompleteCount) || 0;
        return acc;
      },
      {
        totalSpent: 0,
        reimbursableTotal: 0,
        activeTrips: 0,
        paidTrips: 0,
        incompleteCount: 0,
      }
    );
  }, [ledgers]);

  // Filtered ledgers
  const filteredLedgers = useMemo(() => {
    if (!ledgers) return [];
    return ledgers.filter((item) => {
      const matchStatus =
        statusFilter === "all" || (item.status || "draft") === statusFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        (item.trip && item.trip.toLowerCase().includes(query)) ||
        (item.threadId && item.threadId.toLowerCase().includes(query)) ||
        (item.account && item.account.toLowerCase().includes(query)) ||
        (item.relPath && item.relPath.toLowerCase().includes(query));
      return matchStatus && matchSearch;
    });
  }, [ledgers, statusFilter, searchQuery]);

  const handleOpenAttach = (tripName = "") => {
    setAttachInitialTrip(tripName);
    setIsAttachModalOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-6xl space-y-6 pb-16">
        {/* Header */}
        <RouteHeader
          title="Finance & Trip Ledgers"
          description="Manage itemized expense ledgers, audit reimbursement gaps, route plain-text receipts, and generate settlement packages."
          meta={
            ledgers && ledgers.length > 0 ? (
              <Badge variant="muted" size="compact" className="text-xs font-semibold">
                {ledgers.length} {ledgers.length === 1 ? "ledger" : "ledgers"}
              </Badge>
            ) : null
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw size={13} className={cn(loading && "animate-spin")} />
                <span>Refresh</span>
              </Button>
              <Button
                size="sm"
                onClick={() => handleOpenAttach("")}
                className="gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                <span>Attach Receipt</span>
              </Button>
            </div>
          }
        />

        {/* Aggregated Overview Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 anim-stagger">
          {/* Total Spent */}
          <div className="universal-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total Spent</span>
              <DollarSign size={16} className="text-foreground/70" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground tracking-tight">
              {loading && !ledgers ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                formatCurrency(metrics.totalSpent)
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Across {ledgers?.length || 0} recorded ledgers
            </p>
          </div>

          {/* Reimbursable Total */}
          <div className="universal-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Reimbursable</span>
              <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              {loading && !ledgers ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                formatCurrency(metrics.reimbursableTotal)
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {metrics.totalSpent > 0
                ? `${Math.round((metrics.reimbursableTotal / metrics.totalSpent) * 100)}% of total spend`
                : "Eligible claim total"}
            </p>
          </div>

          {/* Active Trips */}
          <div className="universal-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Active Trips</span>
              <Layers size={16} className="text-foreground/70" />
            </div>
            <div className="text-xl font-bold text-foreground tracking-tight">
              {loading && !ledgers ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                `${metrics.activeTrips} Open`
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {metrics.paidTrips} closed & paid
            </p>
          </div>

          {/* Incomplete Items / Gap Indicator */}
          <div className="universal-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Audit Health</span>
              {metrics.incompleteCount > 0 ? (
                <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400" />
              ) : (
                <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <div className="flex items-center gap-2">
              {loading && !ledgers ? (
                <Skeleton className="h-7 w-24" />
              ) : metrics.incompleteCount > 0 ? (
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-lg">
                  <AlertTriangle size={18} />
                  <span>{metrics.incompleteCount} Missing</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                  <CheckCircle2 size={18} />
                  <span>All Clean</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {metrics.incompleteCount > 0
                ? "Rows missing receipt or date"
                : "Zero missing evidence gaps"}
            </p>
          </div>
        </div>

        {/* Quick Expense Natural-Language Router */}
        <QuickExpenseRouterCard onExpenseRouted={refresh} onOpenAttach={handleOpenAttach} />

        {/* Filters & Search Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_TABS.map((t) => {
              const count =
                ledgers &&
                (t.id === "all"
                  ? ledgers.length
                  : ledgers.filter((l) => (l.status || "draft") === t.id).length);

              return (
                <FilterChip
                  key={t.id}
                  selected={statusFilter === t.id}
                  onClick={() => setStatusFilter(t.id)}
                  className="gap-1.5"
                >
                  <span>{t.label}</span>
                  {count != null && (
                    <span className="text-[10px] opacity-70 font-mono">({count})</span>
                  )}
                </FilterChip>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px] sm:w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by trip, account..."
              className="w-full h-8 pl-8 pr-3 text-xs rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-control border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
            <Button variant="ghost" size="xs" onClick={refresh}>
              Try Again
            </Button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && !ledgers && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-stagger">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="universal-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-5 w-16 rounded-pill" />
                </div>
                <Skeleton className="h-3 w-2/3" />
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredLedgers.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={
              ledgers?.length === 0
                ? "No trip ledgers recorded yet"
                : "No matching trip ledgers"
            }
            description={
              ledgers?.length === 0
                ? "Start by attaching a receipt, routing an expense in plain language, or creating a new trip ledger."
                : "No ledgers matched your filter criteria. Try clearing the filter or search term."
            }
            action={
              ledgers?.length === 0 ? (
                <Button size="sm" onClick={() => handleOpenAttach("")} className="gap-1.5">
                  <Plus size={14} />
                  <span>Attach First Receipt</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                >
                  Clear Filters
                </Button>
              )
            }
          />
        )}

        {/* Ledgers Grid */}
        {filteredLedgers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-stagger">
            {filteredLedgers.map((item) => (
              <LedgerCard
                key={item.threadId || item.relPath}
                ledger={item}
                onViewDetails={() => setSelectedLedgerTarget(item.threadId || item.relPath || item.trip)}
                onAuditGaps={() => setGapModalTarget(item.threadId || item.relPath || item.trip)}
                onCloseTrip={() => setCloseTripLedger(item)}
                onSelectDocument={onSelectDocument}
                onAttachReceipt={() => handleOpenAttach(item.trip || item.threadId || "")}
              />
            ))}
          </div>
        )}
      </div>

      {/* 1. Itemized Ledger Detail Modal / Drawer */}
      {selectedLedgerTarget && (
        <LedgerDetailModal
          target={selectedLedgerTarget}
          isOpen={Boolean(selectedLedgerTarget)}
          onClose={() => setSelectedLedgerTarget(null)}
          onSelectDocument={onSelectDocument}
          onOpenGapModal={(target) => {
            setSelectedLedgerTarget(null);
            setGapModalTarget(target);
          }}
          onOpenCloseModal={(ledger) => {
            setSelectedLedgerTarget(null);
            setCloseTripLedger(ledger);
          }}
          onOpenAttachModal={(trip) => {
            setSelectedLedgerTarget(null);
            handleOpenAttach(trip);
          }}
        />
      )}

      {/* 2. Reimbursement Gap Detection Modal */}
      {gapModalTarget && (
        <GapAuditModal
          target={gapModalTarget}
          isOpen={Boolean(gapModalTarget)}
          onClose={() => setGapModalTarget(null)}
          onOpenAttachModal={(trip) => {
            setGapModalTarget(null);
            handleOpenAttach(trip);
          }}
          onOpenCloseModal={(ledger) => {
            setGapModalTarget(null);
            setCloseTripLedger(ledger);
          }}
        />
      )}

      {/* 3. Attach Receipt Modal */}
      <AttachReceiptModal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        initialTrip={attachInitialTrip}
        ledgers={ledgers || []}
        onSuccess={() => {
          refresh();
        }}
      />

      {/* 4. Close Trip & Reimbursement Package Modal */}
      {closeTripLedger && (
        <CloseTripModal
          ledger={closeTripLedger}
          isOpen={Boolean(closeTripLedger)}
          onClose={() => setCloseTripLedger(null)}
          onSelectDocument={onSelectDocument}
          onSuccess={() => {
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Quick Expense Natural Language Router Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function QuickExpenseRouterCard({ onExpenseRouted, onOpenAttach }) {
  const [inputMessage, setInputMessage] = useState("");
  const [routing, setRouting] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [routerError, setRouterError] = useState(null);

  const handleRoute = async (e) => {
    e?.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed || routing) return;

    setRouting(true);
    setRouterError(null);
    setRouteResult(null);

    try {
      const result = await window.dori.call("route_expense", { message: trimmed });
      setRouteResult(result);
      if (result?.action === "moved") {
        onExpenseRouted?.();
      }
    } catch (err) {
      console.error("Expense routing error:", err);
      setRouterError(err.message || "Failed to route expense");
    } finally {
      setRouting(false);
    }
  };

  const handleExampleClick = (exampleText) => {
    setInputMessage(exampleText);
  };

  return (
    <div className="universal-card p-4 space-y-3 border border-border/80 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Sparkles size={15} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">Natural-Language Expense Router</h3>
            <p className="text-[11px] text-muted-foreground">
              Type or paste plain-text expense statements to automatically parse and route into trip ledgers.
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => onOpenAttach?.()}
          className="text-muted-foreground hover:text-foreground gap-1 text-[11px]"
        >
          <UploadCloud size={13} />
          <span>Upload Receipt Image</span>
        </Button>
      </div>

      <form onSubmit={handleRoute} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="e.g. Spent $45 on dinner in Tokyo, Uber ₹520 from airport to hotel, Spent $180 for SF hotel..."
            disabled={routing}
            className="w-full h-9 px-3 text-xs rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={routing || !inputMessage.trim()}
          className="gap-1.5 px-4"
        >
          {routing ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
          <span>Route</span>
        </Button>
      </form>

      {/* Suggested Quick Examples */}
      {!routeResult && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground pt-0.5">
          <span className="font-medium text-foreground/70">Try:</span>
          {[
            "Spent $55 on dinner in Tokyo",
            "Uber $38 from airport to hotel",
            "Spent $220 for Denver conference hotel",
          ].map((eg, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleExampleClick(eg)}
              className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-foreground/80 hover:text-foreground transition-colors cursor-pointer"
            >
              &ldquo;{eg}&rdquo;
            </button>
          ))}
        </div>
      )}

      {/* Error display */}
      {routerError && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{routerError}</span>
          </div>
          <button onClick={() => setRouterError(null)} className="text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Routing Result Feedback Card */}
      {routeResult && (
        <div className="anim-rise rounded-control border border-border bg-[var(--surface-field)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {routeResult.action === "moved" && (
                <Badge variant="default" size="compact" className="bg-emerald-600 text-white">
                  <Check size={11} className="mr-1" /> Routed & Filed
                </Badge>
              )}
              {routeResult.action === "suggested" && (
                <Badge variant="secondary" size="compact">
                  Suggested Destination
                </Badge>
              )}
              {routeResult.action === "conflict" && (
                <Badge variant="muted" size="compact" className="text-amber-600">
                  <AlertTriangle size={11} className="mr-1" /> Multiple Matches
                </Badge>
              )}
              {routeResult.action === "none" && (
                <Badge variant="outline" size="compact">
                  No Open Ledger
                </Badge>
              )}
              {routeResult.action === "not_expense" && (
                <Badge variant="destructive" size="compact">
                  Unrecognized Expense
                </Badge>
              )}

              <span className="text-xs font-semibold text-foreground">
                {routeResult.expense
                  ? `${formatCurrency(routeResult.expense.amount)} • ${routeResult.expense.category || "Travel"} • ${routeResult.expense.description}`
                  : routeResult.reason || "Expense Routing Decision"}
              </span>
            </div>

            <button
              onClick={() => setRouteResult(null)}
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {routeResult.reason}
          </p>

          {routeResult.ledger && (
            <div className="flex items-center gap-2 pt-1 text-xs">
              <span className="text-muted-foreground">Target Trip:</span>
              <span className="font-semibold text-foreground">
                {routeResult.ledger.trip || routeResult.ledger.threadId}
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                ({routeResult.ledger.relPath})
              </span>
            </div>
          )}

          {routeResult.candidates && routeResult.candidates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-medium text-foreground-secondary">
                Candidates:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {routeResult.candidates.map((cand) => (
                  <span
                    key={cand.id || cand.threadId}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-[11px] text-foreground font-medium"
                  >
                    {cand.label || cand.trip || cand.threadId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ledger Card Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LedgerCard({
  ledger,
  onViewDetails,
  onAuditGaps,
  onCloseTrip,
  onSelectDocument,
  onAttachReceipt,
}) {
  const status = ledger.status || "draft";
  const isPaid = status === "paid";
  const isSubmitted = status === "submitted";

  return (
    <div className="universal-card p-5 flex flex-col justify-between space-y-4 hover:border-primary/30 transition-all">
      {/* Top Section */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                onClick={onViewDetails}
                className="font-display text-base font-semibold text-foreground hover:text-primary transition-colors cursor-pointer truncate"
              >
                {ledger.trip || ledger.threadId || "Trip Ledger"}
              </h3>

              {/* Status Badge */}
              <Badge
                variant={isPaid ? "outline" : isSubmitted ? "secondary" : "default"}
                size="compact"
                className={cn(
                  isPaid && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
                  isSubmitted && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                )}
              >
                {status}
              </Badge>

              {ledger.account && (
                <Badge variant="muted" size="compact" className="text-[10px]">
                  {ledger.account}
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground font-mono truncate">
              {ledger.relPath}
            </p>
          </div>

          {/* Quick doc view link */}
          {ledger.relPath && onSelectDocument && (
            <button
              onClick={() => onSelectDocument(ledger.relPath)}
              title="Open source markdown ledger"
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors shrink-0"
            >
              <FileText size={15} />
            </button>
          )}
        </div>

        {/* Incomplete items alert badge */}
        {ledger.incompleteCount > 0 ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
            <AlertTriangle size={13} />
            <span>{ledger.incompleteCount} item{ledger.incompleteCount > 1 ? "s" : ""} missing receipt or date</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs text-muted-foreground">
            <CheckCheck size={13} className="text-emerald-500" />
            <span>All entries verified</span>
          </div>
        )}
      </div>

      {/* Financial Metrics Strip */}
      <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-lg bg-[var(--surface-field)] text-xs">
        <div>
          <span className="block text-[10px] text-muted-foreground uppercase font-medium">Total Spend</span>
          <span className="font-mono font-bold text-foreground">
            {formatCurrency(ledger.total)}
          </span>
        </div>
        <div>
          <span className="block text-[10px] text-muted-foreground uppercase font-medium">Reimbursable</span>
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(ledger.reimbursableTotal)}
          </span>
        </div>
        <div>
          <span className="block text-[10px] text-muted-foreground uppercase font-medium">Rows</span>
          <span className="font-mono font-medium text-foreground">
            {ledger.rowCount ?? 0} entries
          </span>
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={onViewDetails}
            className="gap-1 text-[11px]"
          >
            <Eye size={12} />
            <span>View Ledger</span>
          </Button>

          <Button
            variant="ghost"
            size="xs"
            onClick={onAuditGaps}
            className="gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ShieldAlert size={12} />
            <span>Audit Gaps</span>
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={onAttachReceipt}
            title="Attach receipt to this trip"
            className="gap-1 text-[11px]"
          >
            <Plus size={12} />
            <span>Receipt</span>
          </Button>

          {!isPaid && (
            <Button
              variant="secondary"
              size="xs"
              onClick={onCloseTrip}
              className="gap-1 text-[11px]"
            >
              <CheckCircle2 size={12} />
              <span>{isSubmitted ? "Mark Paid" : "Submit"}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Itemized Ledger Detail Modal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LedgerDetailModal({
  target,
  isOpen,
  onClose,
  onSelectDocument,
  onOpenGapModal,
  onOpenCloseModal,
  onOpenAttachModal,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !target) return;
    setLoading(true);
    setError(null);
    window.dori
      ?.call("get_trip_ledger", { target })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load ledger details:", err);
        setError(err.message || "Failed to load ledger details");
      })
      .finally(() => setLoading(false));
  }, [isOpen, target]);

  if (!isOpen) return null;

  const ledger = data?.ledger;
  const totals = data?.totals;
  const rows = ledger?.rows || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm anim-rise p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold text-foreground truncate">
                {ledger?.trip || data?.threadId || "Itemized Trip Ledger"}
              </h2>
              {ledger?.status && (
                <Badge variant={ledger.status === "paid" ? "outline" : "default"} size="compact">
                  {ledger.status}
                </Badge>
              )}
              {ledger?.account && (
                <Badge variant="muted" size="compact">
                  {ledger.account}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {data?.relPath}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {data?.relPath && onSelectDocument && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onSelectDocument(data.relPath);
                }}
                className="gap-1.5 text-xs"
              >
                <FileText size={13} />
                <span>Open Source Doc</span>
              </Button>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Loading */}
          {loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Loaded Ledger Content */}
          {!loading && data && (
            <>
              {/* Key Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-[var(--surface-field)] space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total Spend</span>
                  <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(totals?.total)}</p>
                </div>
                <div className="p-3.5 rounded-lg bg-[var(--surface-field)] space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Reimbursable Total</span>
                  <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(totals?.reimbursableTotal)}</p>
                </div>
                <div className="p-3.5 rounded-lg bg-[var(--surface-field)] space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total Rows</span>
                  <p className="text-lg font-bold font-mono text-foreground">{totals?.rowCount ?? rows.length}</p>
                </div>
                <div className="p-3.5 rounded-lg bg-[var(--surface-field)] space-y-0.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Audit Gaps</span>
                  <p className={cn("text-lg font-bold font-mono", totals?.incompleteCount > 0 ? "text-amber-600" : "text-emerald-600")}>
                    {totals?.incompleteCount ?? 0}
                  </p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => onOpenAttachModal(ledger?.trip || data?.threadId || "")}
                    className="gap-1.5 text-xs"
                  >
                    <Plus size={13} />
                    <span>Attach Receipt</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenGapModal(data?.threadId || data?.relPath || ledger?.trip)}
                    className="gap-1.5 text-xs"
                  >
                    <ShieldAlert size={13} />
                    <span>Run Gap Audit</span>
                  </Button>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenCloseModal({ ...ledger, threadId: data.threadId, relPath: data.relPath })}
                  className="gap-1.5 text-xs"
                >
                  <FileCheck size={13} />
                  <span>Close & Package Claim</span>
                </Button>
              </div>

              {/* Expense Rows Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Itemized Expenses ({rows.length})
                </h4>

                {rows.length === 0 ? (
                  <div className="p-8 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground space-y-2">
                    <Receipt size={24} className="mx-auto text-muted-foreground/60" />
                    <p>No expense rows recorded in this ledger table yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[var(--surface-field)] border-b border-border text-muted-foreground">
                          <th className="py-2.5 px-3 font-semibold">Date</th>
                          <th className="py-2.5 px-3 font-semibold">Description</th>
                          <th className="py-2.5 px-3 font-semibold">Category</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Tax</th>
                          <th className="py-2.5 px-3 font-semibold">Paid By</th>
                          <th className="py-2.5 px-3 font-semibold">Claimable</th>
                          <th className="py-2.5 px-3 font-semibold">Attachment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={cn(
                              "hover:bg-[var(--space-nav-hover)] transition-colors",
                              row.incomplete && "bg-amber-500/5"
                            )}
                          >
                            {/* Date */}
                            <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                              {row.date ? (
                                row.date
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-500 font-semibold">
                                  <AlertCircle size={12} /> Missing Date
                                </span>
                              )}
                            </td>

                            {/* Description */}
                            <td className="py-2.5 px-3 font-medium text-foreground">
                              {row.description}
                            </td>

                            {/* Category */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {row.category ? (
                                <Badge variant="muted" size="compact">
                                  {row.category}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                              {row.amount ? (
                                formatCurrency(row.amount)
                              ) : (
                                <span className="text-red-500 font-bold">Missing</span>
                              )}
                            </td>

                            {/* Tax */}
                            <td className="py-2.5 px-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                              {row.tax ? formatCurrency(row.tax) : "—"}
                            </td>

                            {/* Paid By */}
                            <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                              {row.paidBy || "self"}
                            </td>

                            {/* Reimbursable */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {row.reimbursable ? (
                                <Badge variant="default" size="compact" className="bg-emerald-600 text-white text-[10px]">
                                  Yes
                                </Badge>
                              ) : (
                                <Badge variant="muted" size="compact" className="text-[10px]">
                                  No
                                </Badge>
                              )}
                            </td>

                            {/* Attachments */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {row.attachments && row.attachments.length > 0 ? (
                                <div className="flex items-center gap-1">
                                  {row.attachments.map((att, aIdx) => {
                                    const filename = att.split("/").pop() || "Receipt";
                                    return (
                                      <button
                                        key={aIdx}
                                        type="button"
                                        onClick={() => {
                                          if (onSelectDocument) {
                                            onClose();
                                            onSelectDocument(att);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-[11px] text-primary font-medium transition-colors"
                                      >
                                        <Paperclip size={11} />
                                        <span className="max-w-[120px] truncate">{filename}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                                  <AlertCircle size={11} /> No receipt
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border px-6 py-3 bg-[var(--surface-field)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Reimbursement Gap Detection Modal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GapAuditModal({
  target,
  isOpen,
  onClose,
  onOpenAttachModal,
  onOpenCloseModal,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !target) return;
    setLoading(true);
    setError(null);
    window.dori
      ?.call("check_reimbursement_gaps", { target })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        console.error("Gap check error:", err);
        setError(err.message || "Failed to check reimbursement gaps");
      })
      .finally(() => setLoading(false));
  }, [isOpen, target]);

  if (!isOpen) return null;

  const gaps = data?.gaps || [];
  const isComplete = data?.complete === true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm anim-rise p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">
                Reimbursement Gap Audit
              </h2>
              {data?.status && (
                <Badge variant="muted" size="compact">
                  {data.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {data?.trip || target} ({data?.ledgerRelPath})
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Audit Status Hero Banner */}
              {isComplete ? (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3.5">
                  <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <ShieldCheck size={22} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      Audit Passed — Ready for Submission
                    </h3>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-relaxed">
                      All {data.claimItems} reimbursable expense items have verifiable dates, valid amounts, recorded payers, and receipt attachments.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3.5">
                  <div className="p-2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                    <ShieldAlert size={22} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      {gaps.length} Audit Gap{gaps.length > 1 ? "s" : ""} Detected
                    </h3>
                    <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                      Some claim items are missing evidence or required details. Review and attach missing receipts before formal submission.
                    </p>
                  </div>
                </div>
              )}

              {/* Stats Strip */}
              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="p-2.5 rounded-md bg-[var(--surface-field)]">
                  <span className="block text-[10px] text-muted-foreground uppercase font-medium">Claim Items</span>
                  <span className="font-mono font-bold text-foreground">{data.claimItems ?? 0}</span>
                </div>
                <div className="p-2.5 rounded-md bg-[var(--surface-field)]">
                  <span className="block text-[10px] text-muted-foreground uppercase font-medium">Excluded Items</span>
                  <span className="font-mono font-bold text-foreground">{data.excludedItems ?? 0}</span>
                </div>
                <div className="p-2.5 rounded-md bg-[var(--surface-field)]">
                  <span className="block text-[10px] text-muted-foreground uppercase font-medium">Audit Gaps</span>
                  <span className={cn("font-mono font-bold", gaps.length > 0 ? "text-amber-600" : "text-emerald-600")}>
                    {gaps.length}
                  </span>
                </div>
              </div>

              {/* Gaps List */}
              <div className="space-y-2 pt-1">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Audit Findings & Evidence Checklist
                </h4>

                {gaps.length === 0 ? (
                  <div className="p-4 rounded-md border border-border bg-[var(--surface-field)] text-xs text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>No missing receipts, incomplete dates, or unresolved payer fields.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gaps.map((gap, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-md border border-border bg-[var(--surface-field)] flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                              Line {gap.line}
                            </span>
                            <span className="font-semibold text-foreground truncate">
                              {gap.description}
                            </span>
                          </div>
                          <p className="text-amber-600 dark:text-amber-400 font-medium">
                            • {gap.issue}
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => onOpenAttachModal(data.trip || target)}
                          className="shrink-0 gap-1 text-[11px]"
                        >
                          <Plus size={11} />
                          <span>Attach</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-[var(--surface-field)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenAttachModal(data?.trip || target)}
              className="gap-1.5 text-xs"
            >
              <Plus size={13} />
              <span>Attach Receipt</span>
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenCloseModal({ trip: data?.trip, relPath: data?.ledgerRelPath, status: data?.status })}
              className="gap-1.5 text-xs"
            >
              <FileCheck size={13} />
              <span>Proceed to Close</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Attach Receipt Modal Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AttachReceiptModal({ isOpen, onClose, initialTrip, ledgers, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [tripChoice, setTripChoice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Travel");
  const [tax, setTax] = useState("");
  const [paidBy, setPaidBy] = useState("self");
  const [reimbursable, setReimbursable] = useState(true);
  const [bookingRef, setBookingRef] = useState("");
  const [supersedes, setSupersedes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTripChoice(initialTrip || "");
      setSelectedFile(null);
      setDate(new Date().toISOString().slice(0, 10));
      setDesc("");
      setAmount("");
      setCategory("Travel");
      setTax("");
      setPaidBy("self");
      setReimbursable(true);
      setBookingRef("");
      setSupersedes("");
      setError(null);
      setResult(null);
    }
  }, [isOpen, initialTrip]);

  if (!isOpen) return null;

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedFile) {
      setError("Please choose or drop a receipt image or document");
      return;
    }
    if (!date || !desc || !amount) {
      setError("Date, description, and amount are required");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid positive amount");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Resolve filePath from file object via preload bridge
      const filePath = window.dori?.getFilePath
        ? window.dori.getFilePath(selectedFile)
        : selectedFile.path || selectedFile.name;

      const payload = {
        filePath,
        file: filePath,
        date,
        desc: desc.trim(),
        amount: numAmount,
        category: category || "Travel",
        paidBy: paidBy.trim() || "self",
        reimbursable: Boolean(reimbursable),
      };

      if (tripChoice.trim()) {
        payload.thread = tripChoice.trim();
        payload.trip = tripChoice.trim();
      }
      if (tax) {
        const numTax = parseFloat(tax);
        if (!isNaN(numTax)) payload.tax = numTax;
      }
      if (bookingRef.trim()) {
        payload.bookingRef = bookingRef.trim();
      }
      if (supersedes.trim()) {
        payload.supersedes = supersedes.trim();
      }

      const res = await window.dori.call("attach_receipt", payload);
      setResult(res);
      onSuccess?.(res);
    } catch (err) {
      console.error("Attach receipt error:", err);
      setError(err.message || "Failed to attach receipt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm anim-rise p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Receipt size={16} />
            </div>
            <h2 className="font-display text-base font-semibold text-foreground">Attach Receipt</h2>
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Success View */}
        {result ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <Check size={24} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Receipt Attached Successfully</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Saved to ledger: <span className="font-mono">{result.ledgerPath}</span>
              </p>
              {result.attachmentPath && (
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  Attachment: {result.attachmentPath}
                </p>
              )}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setSelectedFile(null);
                  setDesc("");
                  setAmount("");
                }}
              >
                Attach Another
              </Button>
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* File Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "p-5 rounded-lg border-2 border-dashed border-border hover:border-primary/50 text-center transition-colors cursor-pointer bg-[var(--surface-field)]",
                selectedFile && "border-primary/50 bg-primary/5"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />

              {selectedFile ? (
                <div className="space-y-1">
                  <Paperclip size={20} className="mx-auto text-primary" />
                  <p className="text-xs font-semibold text-foreground truncate max-w-sm mx-auto">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB • Click or drop to change
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <UploadCloud size={22} className="mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium text-foreground">
                    Click to select or drag & drop receipt file
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Supports PNG, JPG, WEBP, and PDF receipts
                  </p>
                </div>
              )}
            </div>

            {/* Trip / Thread Selection */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary">
                Trip Ledger
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={tripChoice}
                  onChange={(e) => setTripChoice(e.target.value)}
                  placeholder="e.g. tokyo-2026, Denver Conference..."
                  list="ledger-options"
                  className="w-full h-8 px-3 text-xs rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                <datalist id="ledger-options">
                  {ledgers?.map((l) => (
                    <option key={l.threadId || l.relPath} value={l.trip || l.threadId} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Description & Amount Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Vendor / Description *
                </label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="e.g. Dinner with client at Nobu"
                  required
                  className="mt-1 w-full h-8 px-3 text-xs rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="mt-1 w-full h-8 px-3 text-xs font-mono rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Date & Category Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Expense Date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="mt-1 w-full h-8 px-3 text-xs font-mono rounded-control border border-border bg-[var(--surface-field)] text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full h-8 px-2 text-xs rounded-control border border-border bg-[var(--surface-field)] text-foreground focus:outline-none focus:border-primary/50"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tax & Paid By Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Tax / GST (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full h-8 px-3 text-xs font-mono rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Paid By
                </label>
                <input
                  type="text"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  placeholder="self"
                  className="mt-1 w-full h-8 px-3 text-xs rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Booking Ref & Supersedes ID Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Booking Ref (optional)
                </label>
                <input
                  type="text"
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value)}
                  placeholder="e.g. DL-92842"
                  className="mt-1 w-full h-8 px-3 text-xs font-mono rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary">
                  Supersedes ID (optional)
                </label>
                <input
                  type="text"
                  value={supersedes}
                  onChange={(e) => setSupersedes(e.target.value)}
                  placeholder="e.g. capture:abc123"
                  className="mt-1 w-full h-8 px-3 text-xs font-mono rounded-control border border-border bg-[var(--surface-field)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Reimbursable Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={reimbursable}
                onChange={(e) => setReimbursable(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span className="text-xs font-medium text-foreground">
                Reimbursable expense (include in claim package)
              </span>
            </label>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !selectedFile || !desc || !amount}>
                {saving ? "Attaching…" : "Attach Receipt"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Close Trip & Reimbursement Package Modal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CloseTripModal({ ledger, isOpen, onClose, onSelectDocument, onSuccess }) {
  const currentStatus = ledger?.status || "draft";
  const [selectedStatus, setSelectedStatus] = useState(
    currentStatus === "draft" ? "submitted" : "paid"
  );
  const [gapCheck, setGapCheck] = useState(null);
  const [loadingGaps, setLoadingGaps] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen || !ledger) return;
    setLoadingGaps(true);
    setResult(null);
    setError(null);
    const target = ledger.threadId || ledger.relPath || ledger.trip;
    window.dori
      ?.call("check_reimbursement_gaps", { target })
      .then((res) => {
        setGapCheck(res);
      })
      .catch((e) => {
        console.warn("Gap check non-fatal:", e);
      })
      .finally(() => setLoadingGaps(false));
  }, [isOpen, ledger]);

  if (!isOpen || !ledger) return null;

  const handleClose = async (e) => {
    e?.preventDefault();
    setSubmitting(true);
    setError(null);

    const target = ledger.threadId || ledger.relPath || ledger.trip;
    try {
      const res = await window.dori.call("close_trip", {
        target,
        status: selectedStatus,
      });
      setResult(res);
      onSuccess?.(res);
    } catch (err) {
      console.error("Close trip error:", err);
      setError(err.message || "Failed to close trip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm anim-rise p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card">
          <div className="space-y-0.5">
            <h2 className="font-display text-base font-semibold text-foreground">
              Close Trip & Generate Package
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {ledger.trip || ledger.threadId}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Result Screen */}
        {result ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <Check size={24} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Reimbursement Package Generated</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Claim Total: <span className="font-mono font-bold text-foreground">${result.claimTotal}</span> • Status: <span className="font-semibold text-primary">{result.status}</span>
              </p>
              <p className="text-[11px] text-muted-foreground font-mono mt-1">
                {result.packageRelPath}
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              {result.packageRelPath && onSelectDocument && (
                <Button
                  size="sm"
                  onClick={() => {
                    onClose();
                    onSelectDocument(result.packageRelPath);
                  }}
                  className="gap-1.5"
                >
                  <FileText size={13} />
                  <span>Open Package</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Form Content */
          <form onSubmit={handleClose} className="p-6 space-y-4">
            {/* Status Transition Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                Transition Status
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStatus("submitted")}
                  disabled={currentStatus === "submitted" || currentStatus === "paid"}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    selectedStatus === "submitted"
                      ? "border-primary bg-primary/5 text-foreground font-semibold"
                      : "border-border text-muted-foreground hover:border-primary/30",
                    (currentStatus === "submitted" || currentStatus === "paid") && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="text-xs font-semibold">Submitted</div>
                  <div className="text-[10px] text-muted-foreground">Claim sent for approval</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedStatus("paid")}
                  disabled={currentStatus === "paid"}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    selectedStatus === "paid"
                      ? "border-primary bg-primary/5 text-foreground font-semibold"
                      : "border-border text-muted-foreground hover:border-primary/30",
                    currentStatus === "paid" && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="text-xs font-semibold">Paid</div>
                  <div className="text-[10px] text-muted-foreground">Settlement complete</div>
                </button>
              </div>
            </div>

            {/* Gap Warning Banner if any */}
            {!loadingGaps && gapCheck && gapCheck.gaps && gapCheck.gaps.length > 0 && (
              <div className="p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>{gapCheck.gaps.length} Audit Gaps Noted</span>
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  These missing receipts will be documented in the generated package markdown under the &ldquo;Gaps&rdquo; section.
                </p>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Generating…" : "Generate Package & Close"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
