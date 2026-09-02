import { useEffect, useState } from "react";
import { TooltipProvider } from "./components/ui/tooltip.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { ChatView } from "./components/ChatView.jsx";
import { InboxView } from "./components/InboxView.jsx";
import { TasksView } from "./components/TasksView.jsx";
import { ProjectsIndexView } from "./components/ProjectsIndexView.jsx";
import { ProjectView } from "./components/ProjectView.jsx";
import { FinanceView } from "./components/FinanceView.jsx";
import { TimelineView } from "./components/TimelineView.jsx";
import { EntitiesView } from "./components/EntitiesView.jsx";
import { LibraryView } from "./components/LibraryView.jsx";
import { ProfileView } from "./components/ProfileView.jsx";
import { ViewCanvas } from "./components/ViewCanvas.jsx";
import { SearchModal } from "./components/SearchModal.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";

export function App() {
  const [active, setActive] = useState("chat");
  const [profileVersion, setProfileVersion] = useState(0);
  const [activeDocument, setActiveDocument] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Global keyboard shortcuts (/ & Cmd+K for search, Cmd+, for settings)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput =
        tag === "input" ||
        tag === "textarea" ||
        document.activeElement?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === "/" && !isInput) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const unbindSettings = window.dori?.onOpenSettings?.(() =>
      setIsSettingsOpen(true)
    );
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unbindSettings?.();
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--surface-canvas)]">
        <Sidebar
          active={active}
          onSelect={setActive}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onNewNote={() => setActive("chat")}
          profileVersion={profileVersion}
        />

        <main
          key={active}
          className="anim-rise flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {active === "chat" && (
            <ChatView
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenSearch={() => setIsSearchOpen(true)}
            />
          )}

          {active === "inbox" && (
            <InboxView
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active === "tasks" && <TasksView />}

          {active === "finance" && (
            <FinanceView
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active === "timeline" && (
            <TimelineView
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active === "entities" && (
            <EntitiesView
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active === "library" && (
            <LibraryView
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active === "profile" && (
            <ProfileView
              onProfileChanged={() => setProfileVersion((v) => v + 1)}
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active === "projects" && (
            <ProjectsIndexView
              onSelectProject={(path) => setActive(`project:${path}`)}
              onSelectDocument={(path) => setActiveDocument(path)}
            />
          )}

          {active.startsWith("project:") && (
            <ProjectView
              projectPath={active.slice(8)}
              onSelectProject={(path) => setActive(`project:${path}`)}
              onSelectDocument={(path) => setActiveDocument(path)}
              onNavigateHome={() => setActive("chat")}
              onNavigateProjects={() => setActive("projects")}
            />
          )}
        </main>

        {/* Global Search Modal */}
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectDocument={(path) => setActiveDocument(path)}
        />

        {/* Global Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />

        {/* Co-mounted View Canvas Workspace */}
        {activeDocument && (
          <ViewCanvas
            relPath={activeDocument}
            onClose={() => setActiveDocument(null)}
            onOpenDocument={(path) => setActiveDocument(path)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
