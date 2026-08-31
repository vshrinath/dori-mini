import { useCallback, useEffect, useState } from 'react';
import { Input } from './ui/input.jsx';
import { Label } from './ui/label.jsx';
import { Button } from './ui/button.jsx';
import { Skeleton } from './ui/skeleton.jsx';

function ProfileForm({ initial, onSaved }) {
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
      <Button type="submit" size="sm" disabled={saving} className="self-start">
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
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
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h1 className="text-sm font-semibold">Profile</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {profile === undefined && (
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2">
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
          />
        )}
        {profile && !editing && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{profile.name}</dd>
              {profile.role && (
                <>
                  <dt className="text-muted-foreground">Role</dt>
                  <dd>{profile.role}</dd>
                </>
              )}
              {profile.org && (
                <>
                  <dt className="text-muted-foreground">Org</dt>
                  <dd>{profile.org}</dd>
                </>
              )}
              {profile.projects?.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Projects</dt>
                  <dd>{profile.projects.join(', ')}</dd>
                </>
              )}
            </dl>
            <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
