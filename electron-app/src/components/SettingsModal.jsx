import { useEffect, useState } from 'react';
import { X, User, Cpu, Keyboard, Check, AlertCircle } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { cn } from '../lib/utils.js';

export function SettingsModal({ isOpen, onClose, initialTab = 'general' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [profile, setProfile] = useState({ name: '', role: '', bio: '' });
  const [engine, setEngine] = useState('none');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      // Load current profile
      window.dori?.call('get_profile', {})
        .then((data) => {
          if (data) setProfile({ name: data.name || '', role: data.role || '', bio: data.bio || '' });
        })
        .catch(() => {});
      // Load current AI engine
      window.dori?.call('get_engine_config', {})
        .then((cfg) => {
          if (cfg?.replyCli) setEngine(cfg.replyCli);
        })
        .catch(() => {});
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    setIsSaving(true);
    try {
      await window.dori.call('save_profile', profile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectEngine = async (val) => {
    setEngine(val);
    try {
      await window.dori.call('set_engine_config', { replyCli: val });
    } catch (err) {
      console.error('Failed to save engine config:', err);
    }
  };

  const TABS = [
    { id: 'general', label: 'General', icon: User },
    { id: 'intelligence', label: 'AI Providers', icon: Cpu },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] anim-rise p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[80vh] w-[80vw] max-w-4xl min-w-[32rem] flex-col overflow-hidden rounded-control border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Settings</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="flex min-h-0 flex-1">
          {/* Left Tab Sidebar */}
          <aside className="w-60 min-w-[15rem] shrink-0 border-r border-border-soft p-4 bg-[var(--surface-canvas)] flex flex-col justify-start">
            <div className="flex flex-col gap-1 w-full">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'bg-muted text-foreground font-semibold shadow-xs'
                      : 'text-foreground-secondary hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* Right Panel Area */}
          <div className="min-w-0 flex-1 overflow-y-auto p-8 bg-card">
            {activeTab === 'general' && (
              <form onSubmit={handleSaveProfile} className="space-y-6 max-w-lg">
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">Personal Profile</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Your name and identity context used across Dori to personalize chats, notes, and summaries.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Your Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      placeholder="e.g. Alex Mercer"
                      className="w-full rounded-control border border-border bg-[var(--surface-field)] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Role / Headline</label>
                    <input
                      type="text"
                      value={profile.role}
                      onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                      placeholder="e.g. Founder & Systems Architect"
                      className="w-full rounded-control border border-border bg-[var(--surface-field)] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Bio Context</label>
                    <textarea
                      rows={4}
                      value={profile.bio}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      placeholder="Brief background about what you are working on…"
                      className="w-full resize-none rounded-control border border-border bg-[var(--surface-field)] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none leading-relaxed"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button type="submit" size="default" disabled={isSaving} className="text-sm font-medium">
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </Button>
                  {saveSuccess && (
                    <span className="text-sm text-emerald-600 flex items-center gap-1.5 font-medium">
                      <Check size={16} /> Saved
                    </span>
                  )}
                </div>
              </form>
            )}

            {activeTab === 'intelligence' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">AI Providers &amp; Engine</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Dori Go executes locally on your machine, connecting securely to your installed coding CLI.
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  {[
                    {
                      id: 'claude',
                      name: 'Claude Code',
                      badge: 'Recommended',
                      desc: 'Spawns Claude Code CLI headlessly with tool dispatch and project context in your vault.',
                    },
                    {
                      id: 'codex',
                      name: 'Codex',
                      badge: 'OpenAI',
                      desc: 'Spawns OpenAI Codex CLI in sandboxed workspace mode.',
                    },
                    {
                      id: 'none',
                      name: 'Unconfigured / Offline',
                      desc: 'Disable AI completions. Search, capture, and slideover editing remain fully operational.',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectEngine(opt.id)}
                      className={cn(
                        'flex w-full items-start gap-3.5 rounded-panel border p-4 text-left transition-all',
                        engine === opt.id
                          ? 'border-primary/50 bg-primary/5 shadow-xs'
                          : 'border-border-soft bg-card hover:border-border hover:bg-muted/30'
                      )}
                    >
                      <div
                        className={cn(
                          'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          engine === opt.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40'
                        )}
                      >
                        {engine === opt.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{opt.name}</span>
                          {opt.badge && (
                            <Badge variant="muted" size="compact" className="text-xs">
                              {opt.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">Keyboard Shortcuts</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Fast desktop keyboard controls available across Dori Go.
                  </p>
                </div>

                <div className="rounded-panel border border-border-soft overflow-hidden bg-card shadow-xs">
                  <table className="w-full text-left text-sm border-collapse">
                    <tbody>
                      {[
                        { label: 'Global Search Palette', shortcut: 'Cmd + K  or  /' },
                        { label: 'Quick Capture Mini Window', shortcut: 'Cmd + Shift + Space' },
                        { label: 'Save Document in Slideover', shortcut: 'Cmd + S' },
                        { label: 'Open Settings Modal', shortcut: 'Cmd + ,' },
                        { label: 'Close Modal / Slideover Drawer', shortcut: 'Esc' },
                        { label: 'Send Message in Composer', shortcut: 'Enter' },
                        { label: 'New Line in Composer', shortcut: 'Shift + Enter' },
                      ].map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border-soft last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-5 py-3 font-medium text-foreground">{row.label}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                            {row.shortcut}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
