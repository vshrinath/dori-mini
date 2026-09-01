import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Video,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertCircle,
  Users,
  CheckSquare,
  Sparkles,
  RefreshCw,
  Search,
  FolderPlus,
  ArrowRight,
  Copy,
  Check,
  FileCheck,
  BookOpen,
  ChevronRight,
  X,
  UserCheck,
  HelpCircle,
  Folder,
  ArrowUpRight,
} from "lucide-react";
import { RouteHeader } from "./ui/RouteHeader.jsx";
import { Badge } from "./ui/badge.jsx";
import { Button } from "./ui/button.jsx";
import { EmptyState } from "./ui/empty-state.jsx";
import { FilterChip } from "./ui/filter-chip.jsx";
import { Skeleton } from "./ui/skeleton.jsx";
import { cn } from "../lib/utils.js";
import { TRANSITION } from "../lib/motion.js";

const TABS = [
  { id: "all", label: "All Recordings" },
  { id: "unfiled", label: "Unfiled" },
  { id: "filed", label: "Filed in Vault" },
];

export function MeetingsView({ onSelectDocument, onNavigateProject }) {
  const [meetings, setMeetings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail Modal / Slideover State
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState("transcript"); // 'transcript' | 'prep' | 'file'
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Prep State
  const [prepData, setPrepData] = useState(null);
  const [loadingPrep, setLoadingPrep] = useState(false);

  // Routing & Filing State
  const [routingData, setRoutingData] = useState(null);
  const [loadingRouting, setLoadingRouting] = useState(false);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [filingForm, setFilingForm] = useState({
    title: "",
    date: "",
    projectPath: "",
    minutes: "",
  });
  const [isFiling, setIsFiling] = useState(false);
  const [filingSuccess, setFilingSuccess] = useState(null);
  const [filingError, setFilingError] = useState(null);

  // Copy Feedback
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedPrep, setCopiedPrep] = useState(false);

  // Load Meetings List
  const fetchMeetings = useCallback(() => {
    setLoading(true);
    setError(null);
    window.dori
      ?.call("list_fathom_meetings", { includeFiled: true })
      .then((items) => {
        setMeetings(items || []);
        setError(null);
      })
      .catch((err) => {
        const msg = err?.message || String(err);
        if (msg.includes("FATHOM_API_KEY not set") || msg.includes("FATHOM_API_KEY")) {
          setError({
            type: "missing_key",
            message: "FATHOM_API_KEY is not configured.",
            guide: "Add FATHOM_API_KEY=<your_key> to .env or environment variables. You can generate a personal key from Fathom → Settings → API Access.",
          });
        } else {
          setError({
            type: "general",
            message: msg || "Failed to load Fathom meetings.",
          });
        }
        setMeetings([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Load Projects for Filing dropdown
  useEffect(() => {
    window.dori
      ?.call("list_projects", {})
      .then((projs) => {
        setAvailableProjects(projs || []);
      })
      .catch(() => {
        setAvailableProjects([]);
      });
  }, []);

  // Open meeting detail
  const handleSelectMeeting = useCallback((meeting, initialTab = "transcript") => {
    setSelectedMeeting(meeting);
    setActiveTab(initialTab);
    setDetails(null);
    setPrepData(null);
    setRoutingData(null);
    setFilingSuccess(null);
    setFilingError(null);
    setLoadingDetails(true);
    setLoadingPrep(true);
    setLoadingRouting(true);

    const attendees = meeting.invitees || [];
    const dateStr = meeting.date || new Date().toISOString().slice(0, 10);

    setFilingForm({
      title: meeting.title || "Meeting Minutes",
      date: dateStr,
      projectPath: "",
      minutes: `### Summary\nKey points discussed during the meeting.\n\n### Key Decisions\n- \n\n### Action Items\n- [ ] Follow up on next steps`,
    });

    // 1. Fetch transcript details
    window.dori
      ?.call("get_fathom_meeting", { recordingId: meeting.recordingId })
      .then((data) => {
        setDetails(data);
      })
      .catch((err) => {
        console.error("Failed to fetch meeting transcript:", err);
      })
      .finally(() => setLoadingDetails(false));

    // 2. Fetch meeting prep context
    if (attendees.length > 0) {
      window.dori
        ?.call("get_meeting_prep", { attendees })
        .then((prep) => {
          setPrepData(prep);
        })
        .catch((err) => {
          console.error("Failed to load meeting prep:", err);
        })
        .finally(() => setLoadingPrep(false));

      // 3. Route meeting destination
      window.dori
        ?.call("route_meeting", { attendees, key: meeting.title })
        .then((route) => {
          setRoutingData(route);
          if (route?.project || route?.slug) {
            setFilingForm((prev) => ({
              ...prev,
              projectPath: route.slug || route.project || "",
            }));
          }
        })
        .catch((err) => {
          console.error("Failed to route meeting:", err);
        })
        .finally(() => setLoadingRouting(false));
    } else {
      setLoadingPrep(false);
      setLoadingRouting(false);
    }
  }, []);

  // Close meeting detail modal
  const handleCloseDetail = useCallback(() => {
    setSelectedMeeting(null);
    setDetails(null);
    setPrepData(null);
    setRoutingData(null);
    setFilingSuccess(null);
  }, []);

  // Execute Filing
  const handleFileMeeting = useCallback(async () => {
    if (!selectedMeeting) return;
    setIsFiling(true);
    setFilingError(null);

    try {
      const transcriptText = details?.transcript || "";
      const result = await window.dori.call("file_meeting", {
        title: filingForm.title || selectedMeeting.title,
        date: filingForm.date || selectedMeeting.date,
        transcript: transcriptText || "(No transcript recorded)",
        attendees: selectedMeeting.invitees || [],
        projectPath: filingForm.projectPath ? filingForm.projectPath.trim() : undefined,
        fathomRecordingId: selectedMeeting.recordingId,
        fathomUrl: selectedMeeting.url,
        durationMin: selectedMeeting.durationMin,
        minutes: filingForm.minutes ? filingForm.minutes.trim() : undefined,
      });

      setFilingSuccess(result);
      // Update local meeting state to filed
      setMeetings((prev) =>
        prev
          ? prev.map((m) =>
              m.recordingId === selectedMeeting.recordingId ? { ...m, isFiled: true } : m
            )
          : prev
      );
    } catch (err) {
      console.error("Filing failed:", err);
      setFilingError(err?.message || "Failed to file meeting into vault.");
    } finally {
      setIsFiling(false);
    }
  }, [selectedMeeting, details, filingForm]);

  // Copy transcript
  const handleCopyTranscript = useCallback(() => {
    if (!details?.transcript) return;
    navigator.clipboard.writeText(details.transcript);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  }, [details]);

  // Copy prep brief
  const handleCopyPrep = useCallback(() => {
    if (!prepData) return;
    const lines = [`# Meeting Prep Brief: ${selectedMeeting?.title || ""}`, ""];
    if (prepData.attendees?.length) {
      lines.push("## Attendees");
      prepData.attendees.forEach((a) => {
        lines.push(`- ${a.name} (${a.kind})`);
      });
      lines.push("");
    }
    if (prepData.priorMeetings?.length) {
      lines.push("## Prior Meetings");
      prepData.priorMeetings.forEach((m) => {
        lines.push(`- ${m.title} (${m.date || "undated"})`);
      });
      lines.push("");
    }
    if (prepData.tasks?.length) {
      lines.push("## Pending Tasks");
      prepData.tasks.forEach((t) => {
        lines.push(`- [${t.id}] ${t.title} (${t.owner || "unassigned"})`);
      });
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedPrep(true);
    setTimeout(() => setCopiedPrep(false), 2000);
  }, [prepData, selectedMeeting]);

  // Filtered & Searched Meetings
  const filteredMeetings = useMemo(() => {
    if (!meetings) return [];
    return meetings.filter((m) => {
      // Tab filter
      if (filterTab === "unfiled" && m.isFiled) return false;
      if (filterTab === "filed" && !m.isFiled) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (m.title || "").toLowerCase().includes(q);
        const dateMatch = (m.date || "").toLowerCase().includes(q);
        const attendeeMatch = (m.invitees || []).some((i) =>
          (i || "").toLowerCase().includes(q)
        );
        return titleMatch || dateMatch || attendeeMatch;
      }
      return true;
    });
  }, [meetings, filterTab, searchQuery]);

  const counts = useMemo(() => {
    if (!meetings) return { total: 0, unfiled: 0, filed: 0 };
    const unfiled = meetings.filter((m) => !m.isFiled).length;
    const filed = meetings.filter((m) => m.isFiled).length;
    return { total: meetings.length, unfiled, filed };
  }, [meetings]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-5xl space-y-6">
        {/* Header */}
        <RouteHeader
          title="Meetings & Fathom Sync"
          description="Sync Fathom recordings, review transcripts, generate minutes of meeting, and plan attendee briefings."
          meta={
            counts.total > 0 ? (
              <div className="flex items-center gap-2">
                <Badge variant="muted" size="compact" className="text-xs font-semibold">
                  {counts.total} recordings
                </Badge>
                {counts.unfiled > 0 && (
                  <Badge variant="secondary" size="compact" className="text-xs font-semibold">
                    {counts.unfiled} unfiled
                  </Badge>
                )}
              </div>
            ) : null
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMeetings}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} />
              <span>Sync Fathom</span>
            </Button>
          }
        />

        {/* Missing API Key Guidance Banner */}
        {error?.type === "missing_key" && (
          <div className="rounded-panel border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-foreground flex items-start gap-3.5 shadow-xs">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <h4 className="font-semibold text-amber-700 dark:text-amber-300 text-sm">
                Fathom API Key Required
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                {error.guide}
              </p>
              <div className="pt-1 flex items-center gap-2">
                <a
                  href="https://fathom.video/settings/api"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:underline font-semibold"
                >
                  <span>Open Fathom API Settings</span>
                  <ArrowUpRight size={12} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {TABS.map((t) => (
              <FilterChip
                key={t.id}
                selected={filterTab === t.id}
                onClick={() => setFilterTab(t.id)}
              >
                {t.label}
                {t.id === "all" && counts.total > 0 && ` (${counts.total})`}
                {t.id === "unfiled" && counts.unfiled > 0 && ` (${counts.unfiled})`}
                {t.id === "filed" && counts.filed > 0 && ` (${counts.filed})`}
              </FilterChip>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search meetings or attendees…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-control border border-border bg-[var(--surface-field)] pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-[var(--focus-outline)] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Loading Skeletons */}
        {loading && !meetings && (
          <div className="space-y-3.5 anim-stagger">
            {[1, 2, 3].map((i) => (
              <div key={i} className="universal-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-4 w-20 rounded-pill" />
                </div>
                <Skeleton className="h-4 w-1/3" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredMeetings.length === 0 && (
          <EmptyState
            icon={Video}
            title={
              meetings?.length === 0
                ? "No Fathom recordings found"
                : searchQuery
                ? "No meetings match your search"
                : `No ${filterTab} meetings found`
            }
            description={
              meetings?.length === 0
                ? "Recordings from your Fathom account will appear here once synced with your API key."
                : searchQuery
                ? `No recordings matching "${searchQuery}". Try adjusting your keywords.`
                : "You have no meetings in this category."
            }
            action={
              meetings?.length === 0
                ? {
                    label: "Check Sync",
                    onClick: fetchMeetings,
                  }
                : undefined
            }
          />
        )}

        {/* Meetings List */}
        {filteredMeetings.length > 0 && (
          <div className="space-y-3.5 anim-stagger">
            {filteredMeetings.map((m) => (
              <div
                key={m.recordingId}
                className="universal-card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 group transition-all hover:border-[var(--hairline-strong)]"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground truncate">
                      {m.title || "Untitled Meeting"}
                    </h3>
                    <Badge
                      variant={m.isFiled ? "outline" : "secondary"}
                      size="compact"
                      className="font-medium"
                    >
                      {m.isFiled ? "Filed in Vault" : "Unfiled"}
                    </Badge>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {m.date && (
                      <span className="flex items-center gap-1.5 font-medium">
                        <Calendar size={13} className="text-muted-foreground/70" />
                        <span>{m.date}</span>
                      </span>
                    )}
                    {m.durationMin != null && (
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-muted-foreground/70" />
                        <span>~{m.durationMin} min</span>
                      </span>
                    )}
                    {m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>Fathom Video</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  {/* Attendees */}
                  {m.invitees && m.invitees.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                        Attendees:
                      </span>
                      {m.invitees.slice(0, 4).map((att) => (
                        <span
                          key={att}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-field)] px-2 py-0.5 text-[11px] font-medium text-foreground-secondary border border-border/50"
                        >
                          <Users size={10} className="text-muted-foreground/80" />
                          <span>{att}</span>
                        </span>
                      ))}
                      {m.invitees.length > 4 && (
                        <span className="text-[11px] text-muted-foreground">
                          +{m.invitees.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectMeeting(m, "transcript")}
                    className="gap-1.5 text-xs"
                  >
                    <FileText size={13} />
                    <span>Transcript</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectMeeting(m, "prep")}
                    className="gap-1.5 text-xs"
                  >
                    <BookOpen size={13} />
                    <span>Prep Brief</span>
                  </Button>

                  {!m.isFiled ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSelectMeeting(m, "file")}
                      className="gap-1.5 text-xs"
                    >
                      <Sparkles size={13} />
                      <span>File MoM</span>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectMeeting(m, "file")}
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <FileCheck size={13} className="text-green-600 dark:text-green-400" />
                      <span>Re-file</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Meeting Detail & MoM Filing Slideover Modal */}
      {selectedMeeting && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            onClick={handleCloseDetail}
            style={{ transition: TRANSITION.backdrop }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
          />

          {/* Drawer Panel */}
          <div
            style={{ transition: TRANSITION.slideover }}
            className="relative z-10 flex h-full w-full md:w-3/5 lg:w-1/2 max-w-none flex-col bg-background shadow-2xl border-l border-border animate-dialog-in"
          >
            {/* Drawer Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4 bg-card">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={selectedMeeting.isFiled ? "outline" : "secondary"}
                    size="compact"
                    className="font-medium"
                  >
                    {selectedMeeting.isFiled ? "Filed in Vault" : "Unfiled Recording"}
                  </Badge>
                  {selectedMeeting.durationMin && (
                    <span className="text-xs text-muted-foreground">
                      ~{selectedMeeting.durationMin} mins
                    </span>
                  )}
                </div>
                <h2 className="truncate text-lg font-semibold text-foreground mt-1">
                  {selectedMeeting.title || "Meeting Details"}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedMeeting.url && (
                  <a
                    href={selectedMeeting.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Open in Fathom"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
                <button
                  onClick={handleCloseDetail}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex shrink-0 border-b border-border bg-[var(--surface-field)] px-6 py-1.5 gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("transcript")}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-xs font-semibold transition-all",
                  activeTab === "transcript"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText size={13} />
                <span>Transcript</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("prep")}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-xs font-semibold transition-all",
                  activeTab === "prep"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BookOpen size={13} />
                <span>Prep & Attendees</span>
                {prepData?.tasks?.length ? (
                  <span className="ml-1 rounded-full bg-[var(--brand-primary)]/15 px-1.5 py-0.2 text-[10px] text-[var(--brand-primary)]">
                    {prepData.tasks.length}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-xs font-semibold transition-all",
                  activeTab === "file"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles size={13} className="text-[var(--brand-accent)]" />
                <span>Minutes & Filing</span>
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
              {/* TAB 1: TRANSCRIPT */}
              {activeTab === "transcript" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <div className="text-xs text-muted-foreground">
                      {details?.segments?.length
                        ? `${details.segments.length} spoken segments`
                        : "Recording transcript"}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyTranscript}
                      disabled={!details?.transcript}
                      className="gap-1.5 text-xs"
                    >
                      {copiedTranscript ? (
                        <>
                          <Check size={13} className="text-green-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy Transcript</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {loadingDetails && (
                    <div className="space-y-4 pt-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  )}

                  {!loadingDetails && details?.segments && details.segments.length > 0 && (
                    <div className="space-y-3.5">
                      {details.segments.map((seg, idx) => (
                        <div
                          key={idx}
                          className="rounded-panel border border-border/60 bg-card p-3.5 space-y-1.5 hover:border-[var(--hairline-strong)] transition-colors"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
                              {seg.speaker?.display_name || "Speaker"}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {seg.timestamp || `00:${idx * 15}`}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/90 leading-relaxed font-normal">
                            {seg.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loadingDetails && (!details?.segments || details.segments.length === 0) && (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      {details?.transcript ? (
                        <div className="whitespace-pre-wrap text-left font-mono text-xs p-4 rounded-panel bg-[var(--surface-field)] border border-border">
                          {details.transcript}
                        </div>
                      ) : (
                        "No transcript data available for this recording."
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PREP BRIEFING */}
              {activeTab === "prep" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <div className="text-xs text-muted-foreground">
                      Context assembled from vault people, prior meetings, and tasks
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPrep}
                      disabled={!prepData}
                      className="gap-1.5 text-xs"
                    >
                      {copiedPrep ? (
                        <>
                          <Check size={13} className="text-green-500" />
                          <span>Copied Brief</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy Brief</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {loadingPrep && (
                    <div className="space-y-4 pt-2">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  )}

                  {!loadingPrep && prepData && (
                    <div className="space-y-6">
                      {/* Attendees Classification */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Users size={13} className="text-[var(--brand-primary)]" />
                          <span>Attendees ({prepData.attendees?.length || 0})</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {(prepData.attendees || []).map((att) => (
                            <div
                              key={att.name}
                              className="rounded-panel border border-border bg-card p-3 flex items-start gap-2.5"
                            >
                              {att.kind === "known" ? (
                                <UserCheck size={16} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                              ) : att.kind === "ambiguous" ? (
                                <HelpCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                              ) : (
                                <Users size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-xs text-foreground truncate">
                                  {att.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {att.kind === "known"
                                    ? "Verified contact in vault"
                                    : att.kind === "ambiguous"
                                    ? "Multiple matching contacts"
                                    : "Newly seen attendee"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Prior Meetings */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Calendar size={13} className="text-[var(--brand-primary)]" />
                          <span>Prior Related Meetings ({prepData.priorMeetings?.length || 0})</span>
                        </h4>

                        {prepData.priorMeetings && prepData.priorMeetings.length > 0 ? (
                          <div className="space-y-2">
                            {prepData.priorMeetings.map((m) => (
                              <div
                                key={m.file}
                                className="rounded-panel border border-border/80 bg-card p-3 flex items-center justify-between text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-foreground block truncate">
                                    {m.title}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground font-mono mt-0.5 block">
                                    {m.file}
                                  </span>
                                </div>
                                {m.date && (
                                  <span className="text-[11px] text-muted-foreground font-medium shrink-0 ml-2">
                                    {m.date}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic rounded-panel bg-[var(--surface-field)] p-3 border border-border/50">
                            No prior meetings found for these attendees in this project context.
                          </div>
                        )}
                      </div>

                      {/* Open Tasks */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <CheckSquare size={13} className="text-[var(--brand-primary)]" />
                          <span>Open Pending Tasks ({prepData.tasks?.length || 0})</span>
                        </h4>

                        {prepData.tasks && prepData.tasks.length > 0 ? (
                          <div className="space-y-2">
                            {prepData.tasks.map((t) => (
                              <div
                                key={t.id}
                                className="rounded-panel border border-border/80 bg-card p-3 flex items-start gap-2.5 text-xs"
                              >
                                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-foreground block">
                                    {t.title}
                                  </span>
                                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                                    <span className="font-mono">{t.id}</span>
                                    {t.owner && <span>Owner: {t.owner}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic rounded-panel bg-[var(--surface-field)] p-3 border border-border/50">
                            No pending tasks associated with these attendees.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: MINUTES & FILING */}
              {activeTab === "file" && (
                <div className="space-y-5">
                  {/* Success Banner */}
                  {filingSuccess && (
                    <div className="rounded-panel border border-green-500/30 bg-green-500/10 p-4 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold text-sm">
                        <CheckCircle2 size={18} />
                        <span>Meeting filed successfully!</span>
                      </div>
                      <p className="text-muted-foreground font-mono text-[11px]">
                        Saved to: {filingSuccess.relPath}
                      </p>
                      {onSelectDocument && (
                        <div className="pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              onSelectDocument(filingSuccess.relPath);
                              handleCloseDetail();
                            }}
                            className="gap-1.5"
                          >
                            <FileText size={13} />
                            <span>View Filed Note</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Banner */}
                  {filingError && (
                    <div className="rounded-panel border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{filingError}</span>
                    </div>
                  )}

                  {/* Routing Suggestion Banner */}
                  {routingData && (
                    <div className="rounded-panel border border-border bg-[var(--surface-field)] p-3.5 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Folder size={14} className="text-[var(--brand-primary)]" />
                        <span>Destination Routing Recommendation</span>
                        <Badge variant="accent" size="compact">
                          {routingData.action === "moved"
                            ? "High Confidence"
                            : routingData.action === "suggested"
                            ? "Suggested"
                            : "Unbound / General"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        {routingData.project
                          ? `Matched project "${routingData.project}" based on attendee project links.`
                          : routingData.reason || "No specific project matched; will file in general meetings directory."}
                      </p>
                    </div>
                  )}

                  {/* Filing Form */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Meeting Title
                      </label>
                      <input
                        type="text"
                        value={filingForm.title}
                        onChange={(e) =>
                          setFilingForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        className="w-full rounded-control border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-[var(--focus-outline)] focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1">
                          Date
                        </label>
                        <input
                          type="date"
                          value={filingForm.date}
                          onChange={(e) =>
                            setFilingForm((prev) => ({ ...prev, date: e.target.value }))
                          }
                          className="w-full rounded-control border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-[var(--focus-outline)] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1">
                          Destination Project (Optional)
                        </label>
                        <select
                          value={filingForm.projectPath}
                          onChange={(e) =>
                            setFilingForm((prev) => ({ ...prev, projectPath: e.target.value }))
                          }
                          className="w-full rounded-control border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-[var(--focus-outline)] focus:outline-none"
                        >
                          <option value="">(None / General meetings)</option>
                          {availableProjects.map((p) => (
                            <option key={p.projectPath} value={p.projectPath}>
                              {p.title || p.projectPath}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Minutes of Meeting (Markdown)
                      </label>
                      <textarea
                        rows={8}
                        value={filingForm.minutes}
                        onChange={(e) =>
                          setFilingForm((prev) => ({ ...prev, minutes: e.target.value }))
                        }
                        placeholder="Write structured minutes, key decisions, and action items…"
                        className="w-full font-mono rounded-control border border-border bg-card p-3 text-xs text-foreground focus:border-[var(--focus-outline)] focus:outline-none leading-relaxed"
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="primary"
                        onClick={handleFileMeeting}
                        disabled={isFiling || !filingForm.title}
                        className="gap-2"
                      >
                        <Sparkles size={14} />
                        <span>{isFiling ? "Filing Meeting…" : "File Minutes to Vault"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
