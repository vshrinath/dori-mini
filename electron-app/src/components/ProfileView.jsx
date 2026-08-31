import { useCallback, useEffect, useState } from 'react';
import {
  Briefcase,
  Pencil,
  Plus,
  Mail,
  MapPin,
  Globe,
  Building2,
  FileText,
  FileCode2,
} from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { EditProfileModal } from './EditProfileModal.jsx';
import { AddToProfileModal } from './AddToProfileModal.jsx';

function LinkedinIcon({ size = 14, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function TwitterIcon({ size = 14, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function initialsOf(name) {
  return (
    name
      ?.split(/\s+/)
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'D'
  );
}

function withProtocol(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
}

export function ProfileView({ onProfileChanged, onSelectDocument }) {
  const [profile, setProfile] = useState(undefined);
  const [docs, setDocs] = useState([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const refresh = useCallback(() => {
    window.dori
      ?.call('get_profile', {})
      .then(setProfile)
      .catch(() => setProfile(null));

    window.dori
      ?.call('list_documents', {})
      .then((list) => {
        // Filter profile docs or show recent outputs
        const profileDocs = list.filter((d) => d.rel_path?.startsWith('profile/'));
        setDocs(profileDocs.length > 0 ? profileDocs : list.slice(0, 8));
      })
      .catch(() => setDocs([]));
  }, []);

  useEffect(refresh, [refresh]);

  const name = profile?.name || 'My Profile';
  const role = profile?.role || profile?.title;
  const location = profile?.location;
  const email = profile?.email;
  const bio = profile?.bio || profile?.tagline;
  const org = profile?.org || profile?.companyName;
  const industry = profile?.industry;

  const socialLinks = [
    { url: profile?.links?.linkedin || profile?.linkedin, icon: LinkedinIcon, label: 'LinkedIn' },
    { url: profile?.links?.twitter || profile?.twitter, icon: TwitterIcon, label: 'X / Twitter' },
    { url: profile?.links?.website || profile?.website, icon: Globe, label: 'Website' },
  ].filter((l) => Boolean(l.url));

  const hasContact = Boolean(email || location || socialLinks.length > 0);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-5xl space-y-8">
        {/* Header */}
        <RouteHeader
          title={name}
          description={
            [role, location].filter(Boolean).join(' · ') ||
            'What Dori knows about you — used when personalizing notes and chat.'
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(true)}
                className="text-xs bg-card border-border-soft gap-1.5"
              >
                <Pencil size={13} />
                <span>Edit</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setIsAddOpen(true)}
                className="text-xs gap-1.5"
              >
                <Plus size={14} />
                <span>Add</span>
              </Button>
            </div>
          }
        />

        {profile === undefined && (
          <div className="flex items-start gap-5">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        )}

        {profile && (
          <>
            {/* Identity Card Block */}
            <div className="universal-card p-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold shadow-sm">
                {initialsOf(name)}
              </div>
              <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">{name}</h2>
                  {role && <p className="text-xs text-muted-foreground font-medium mt-0.5">{role}</p>}
                </div>

                {bio && (
                  <p className="text-xs text-foreground-secondary leading-relaxed max-w-2xl">
                    {bio}
                  </p>
                )}

                {hasContact && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-muted-foreground">
                    {email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail size={13} className="shrink-0" />
                        <span>{email}</span>
                      </span>
                    )}
                    {location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={13} className="shrink-0" />
                        <span>{location}</span>
                      </span>
                    )}
                    {socialLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <a
                          key={link.label}
                          href={withProtocol(link.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                          title={link.label}
                        >
                          <Icon size={13} className="shrink-0" />
                          <span className="capitalize">{link.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Company / Organization Card */}
            {org && (
              <div className="universal-card p-5 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Organization / Venture
                </p>
                <div className="flex items-start gap-3 pt-1">
                  <div className="rounded-lg bg-muted p-2 text-foreground-secondary">
                    <Building2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-semibold text-foreground">{org}</h3>
                      {industry && (
                        <Badge variant="muted" size="compact" className="text-[10px]">
                          {industry}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Documents & References / My Work Grid */}
            <section className="space-y-4 pt-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="font-display text-sm font-semibold text-foreground">
                    Documents &amp; References
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Personal writings, bios, and references stored in your vault.
                  </p>
                </div>
                <span className="text-micro text-muted-foreground font-mono">
                  {docs.length} {docs.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {docs.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No profile documents yet"
                  description="Add notes, bios, or documents to your profile to enrich context."
                />
              ) : (
                <div className="anim-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {docs.map((doc) => {
                    const Icon = doc.type === 'note' || !doc.type ? FileText : FileCode2;
                    return (
                      <button
                        key={doc.rel_path}
                        onClick={() => onSelectDocument?.(doc.rel_path)}
                        className="universal-card group flex flex-col p-4 text-left"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="rounded-md bg-muted p-1.5 text-foreground-secondary group-hover:bg-[var(--surface-tint)] group-hover:text-primary transition-colors">
                            <Icon size={14} />
                          </div>
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {doc.type || 'note'}
                          </span>
                        </div>
                        <h3 className="line-clamp-1 font-display text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {doc.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-micro text-muted-foreground leading-relaxed">
                          {doc.rel_path}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* Modals */}
        <EditProfileModal
          isOpen={isEditOpen}
          initial={profile}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => {
            refresh();
            onProfileChanged?.();
          }}
        />

        <AddToProfileModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onAdded={refresh}
        />
      </div>
    </div>
  );
}
