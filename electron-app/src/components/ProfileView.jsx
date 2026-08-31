// Matches dori-portal's real app/profile/page.tsx: 64px initials avatar +
// identity block laid out side by side (not stacked), Edit as an outline
// button with a Pencil icon in the header actions slot (not an inline
// hover-pencil), org shown in a bordered/shadowed Panel card.
import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Pencil } from 'lucide-react';
import { Input } from './ui/input.jsx';
import { Label } from './ui/label.jsx';
import { Button } from './ui/button.jsx';
import { Skeleton } from './ui/skeleton.jsx';

function ProfileForm({ initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [role, setRole] = useState(initial?.role || '');
  const [org, setOrg] = useState(initial?.org || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(
    (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSaving(true);
      window.dori
        .call('set_profile', { name: name.trim(), role: role.trim() || undefined, org: org.trim() || undefined })
        .then(onSaved)
        .catch((err) => setError(err.message))
        .finally(() => setSaving(false));
    },
    [name, role, org, onSaved]
  );

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-role">Role</Label>
        <Input id="profile-role" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-org">Org</Label>
        <Input id="profile-org" value={org} onChange={(e) => setOrg(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function initialsOf(name) {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ProfileView({ onProfileChanged }) {
  const [profile, setProfile] = useState(undefined);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(() => {
    window.dori
      .call('get_profile', {})
      .then((p) => {
        setProfile(p);
        setEditing(!p);
      })
      .catch(() => setProfile(null));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="bg-background sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Profile</h1>
        {profile && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={13} />
            Edit
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {profile === undefined && (
          <div className="flex items-start gap-5">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        )}
        {profile !== undefined && editing && (
          <ProfileForm
            initial={profile}
            onSaved={() => {
              refresh();
              setEditing(false);
              onProfileChanged?.();
            }}
            onCancel={profile ? () => setEditing(false) : undefined}
          />
        )}
        {profile && !editing && (
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-5">
              <span className="bg-primary text-primary-foreground flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold">
                {initialsOf(profile.name)}
              </span>
              <div className="min-w-0 flex-1 space-y-3 pt-1">
                <h2 className="text-lg font-medium">{profile.name}</h2>
                {profile.role && (
                  <p className="text-foreground-secondary text-base leading-relaxed">{profile.role}</p>
                )}
              </div>
            </div>
            {profile.org && (
              <div className="border-border bg-card rounded-panel border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Briefcase size={14} className="text-muted-foreground" />
                  {profile.org}
                </div>
              </div>
            )}
            {profile.projects?.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">Projects</p>
                <p className="text-sm">{profile.projects.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
