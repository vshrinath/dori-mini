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
    { id: 'intelligence', label: 'AI Engine', icon: Cpu },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm anim-rise"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[520px] w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body: Sidebar + Content */}
        <div className="flex min-h-0 flex-1">
          {/* Tab Rail */}
          <div className="w-44 shrink-0 border-r border-border p-3 space-y-1 bg-[var(--surface-canvas)]">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs font-medium transition-colors',
                  activeTab === id
                    ? 'bg-muted text-foreground font-semibold shadow-xs'
                    : 'text-foreground-secondary hover:bg-muted/60'
                )}
              >
                <Icon size={15} className="shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Personal Profile</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your name and context used across Dori to personalize responses and notes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground-secondary">Your Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="e.g. Alex Mercer"
                    className="w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground-secondary">Role / Title</label>
                  <input
                    type="text"
                    value={profile.role}
                    onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                    placeholder="e.g. Founder & Architect"
                    className="w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground-secondary">Bio / Background Context</label>
                  <textarea
                    rows={3}
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Brief background about what you are working on…"
                    className="w-full resize-none rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button type="submit" size="sm" disabled={isSaving} className="text-xs">
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </Button>
                  {saveSuccess && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                      <Check size={13} /> Saved
                    </span>
                  )}
                </div>
              </form>
            )}

            {activeTab === 'intelligence' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Engine Provider</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Dori Go runs entirely locally on your machine, leveraging your installed coding CLI backend.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  {[
                    {
                      id: 'claude',
                      name: 'Claude Code',
                      badge: 'Recommended',
                      desc: 'Spawns Claude Code CLI headlessly with strict action dispatch sandboxing.',
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
                      desc: 'Disable AI completions. Search, capture, and slideover editing remain fully functional.',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectEngine(opt.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-panel border p-3.5 text-left transition-all',
                        engine === opt.id
                          ? 'border-primary/50 bg-primary/5 shadow-xs'
                          : 'border-border-soft bg-card hover:border-border hover:bg-muted/30'
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          engine === opt.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40'
                        )}
                      >
                        {engine === opt.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{opt.name}</span>
                          {opt.badge && (
                            <Badge variant="muted" size="compact" className="text-[10px]">
                              {opt.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fast desktop keyboard controls available across Dori Go.
                  </p>
                </div>

                <div className="rounded-panel border border-border overflow-hidden bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <tbody>
                      {[
                        { label: 'Global Search', shortcut: 'Cmd + K  or  /' },
                        { label: 'Quick Capture Mini Window', shortcut: 'Cmd + Shift + Space' },
                        { label: 'Save Document in Slideover', shortcut: 'Cmd + S' },
                        { label: 'Open Settings', shortcut: 'Cmd + ,' },
                        { label: 'Close Modal / Slideover', shortcut: 'Esc' },
                        { label: 'Send Message in Composer', shortcut: 'Enter' },
                        { label: 'New Line in Composer', shortcut: 'Shift + Enter' },
                      ].map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
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
