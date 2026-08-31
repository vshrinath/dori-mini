import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { Button } from './ui/button.jsx';

export function EditProfileModal({ isOpen, onClose, initial, onSaved }) {
  const [profile, setProfile] = useState({
    name: '',
    role: '',
    location: '',
    email: '',
    bio: '',
    linkedin: '',
    twitter: '',
    website: '',
    org: '',
    industry: '',
    oneLiner: '',
    companySite: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && initial) {
      setProfile({
        name: initial.name || '',
        role: initial.role || initial.title || '',
        location: initial.location || '',
        email: initial.email || '',
        bio: initial.bio || initial.tagline || '',
        linkedin: initial.linkedin || initial.links?.linkedin || '',
        twitter: initial.twitter || initial.links?.twitter || '',
        website: initial.website || initial.links?.website || '',
        org: initial.org || initial.companyName || '',
        industry: initial.industry || initial.companyIndustry || '',
        oneLiner: initial.oneLiner || initial.companyOneLiner || '',
        companySite: initial.companySite || '',
      });
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!profile.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await window.dori.call('set_profile', {
        name: profile.name.trim(),
        role: profile.role.trim() || undefined,
        org: profile.org.trim() || undefined,
        bio: profile.bio.trim() || undefined,
        location: profile.location.trim() || undefined,
        email: profile.email.trim() || undefined,
        links: {
          linkedin: profile.linkedin.trim() || undefined,
          twitter: profile.twitter.trim() || undefined,
          website: profile.website.trim() || undefined,
        },
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm anim-rise"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-[580px] max-w-[92vw] flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">Edit Profile</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground-secondary">Name</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Your full name"
                required
                className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-foreground-secondary">Headline / Role</label>
                <input
                  type="text"
                  value={profile.role}
                  onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                  placeholder="e.g. Founder & Systems Architect"
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground-secondary">Location</label>
                <input
                  type="text"
                  value={profile.location}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  placeholder="e.g. San Francisco, CA"
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground-secondary">Email</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground-secondary">About / Bio Tagline</label>
              <textarea
                rows={2}
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="A sentence or two on who you are and what you do."
                className="mt-1 w-full resize-none rounded-control border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Social Links */}
          <div className="border-t border-border pt-3 space-y-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Social Links</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-micro font-medium text-foreground-secondary">LinkedIn</label>
                <input
                  type="text"
                  value={profile.linkedin}
                  onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
                  placeholder="linkedin.com/in/..."
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-foreground-secondary">X / Twitter</label>
                <input
                  type="text"
                  value={profile.twitter}
                  onChange={(e) => setProfile({ ...profile, twitter: e.target.value })}
                  placeholder="x.com/..."
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-foreground-secondary">Website</label>
                <input
                  type="text"
                  value={profile.website}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Company / Org */}
          <div className="border-t border-border pt-3 space-y-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Organization / Company</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-micro font-medium text-foreground-secondary">Organization Name</label>
                <input
                  type="text"
                  value={profile.org}
                  onChange={(e) => setProfile({ ...profile, org: e.target.value })}
                  placeholder="Acme Inc."
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-foreground-secondary">Industry</label>
                <input
                  type="text"
                  value={profile.industry}
                  onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                  placeholder="e.g. AI / Infrastructure"
                  className="mt-1 w-full rounded-control border border-border bg-[var(--surface-field)] px-2.5 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !profile.name.trim()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
