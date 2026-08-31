import { useEffect, useState } from 'react';

export function ProfileView() {
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    window.dori
      .call('get_profile', {})
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h1 className="text-sm font-semibold">Profile</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {profile === undefined && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {profile === null && (
          <p className="text-sm text-muted-foreground">
            No profile set yet — mark a person entity <code>is_self: true</code> in the vault.
          </p>
        )}
        {profile && (
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
        )}
      </div>
    </section>
  );
}
