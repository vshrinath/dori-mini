import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Sparkles,
  Users,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Key,
  GitMerge,
  Copy,
  Check,
  X,
  FileText,
  Palette,
  Type,
  Globe,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
  User,
  Briefcase,
  Layers,
  Clock,
  Compass,
  FileCheck
} from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { Input } from './ui/input.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { CredentialsModal } from './CredentialsModal.jsx';
import { cn } from '../lib/utils.js';

const TABS = [
  { id: 'accounts', label: 'Accounts & Orgs', icon: Building2 },
  { id: 'people', label: 'People Directory', icon: Users },
  { id: 'brands', label: 'Brands', icon: Sparkles },
  { id: 'research', label: 'Research & Briefing', icon: Search },
  { id: 'merge', label: 'Entity Merging', icon: GitMerge },
];

const ACCOUNT_STATUS_CHIPS = [
  { id: 'all', label: 'All Accounts' },
  { id: 'client', label: 'Clients' },
  { id: 'prospect', label: 'Prospects' },
  { id: 'collaborator', label: 'Collaborators' },
  { id: 'founder-advisory', label: 'Advisory' },
  { id: 'vendor', label: 'Vendors' },
  { id: 'partner', label: 'Partners' },
];

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('client')) return { label: 'Client', variant: 'default', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
  if (s.includes('proposal') || s.includes('sent')) return { label: 'Proposal Sent', variant: 'secondary', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
  if (s.includes('active') || s.includes('conversation')) return { label: 'Active', variant: 'secondary', color: 'bg-teal-500/10 text-teal-600 border-teal-500/20' };
  if (s.includes('discovery') || s.includes('lead')) return { label: 'Discovery', variant: 'outline', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
  return { label: status || 'Active', variant: 'muted', color: 'bg-muted text-muted-foreground border-border-soft' };
}

function getKindBadge(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('prospect')) return { label: 'Prospect', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' };
  if (k.includes('client')) return { label: 'Client', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
  if (k.includes('collaborator')) return { label: 'Collaborator', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' };
  if (k.includes('advisory')) return { label: 'Advisory', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' };
  if (k.includes('vendor')) return { label: 'Vendor', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
  if (k.includes('partner')) return { label: 'Partner', color: 'bg-sky-500/10 text-sky-600 border-sky-500/20' };
  return { label: kind || 'Account', color: 'bg-muted text-muted-foreground border-border-soft' };
}

export function EntitiesView({ onSelectDocument }) {
  const [activeTab, setActiveTab] = useState('accounts');
  const [orgs, setOrgs] = useState(null);
  const [people, setPeople] = useState(null);
  const [brands, setBrands] = useState(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [accountQuery, setAccountQuery] = useState('');
  const [accountKindFilter, setAccountKindFilter] = useState('all');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [brandQuery, setBrandQuery] = useState('');

  // Modals & Drawers
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);
  const [isAddOrgOpen, setIsAddOrgOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [guidelinesData, setGuidelinesData] = useState(null);
  const [guidelinesLoading, setGuidelinesLoading] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Add Org Form State
  const [newOrgForm, setNewOrgForm] = useState({
    orgName: '',
    role: 'client',
    personName: '',
    personSlug: '',
    evidenceText: '',
    requireEvidence: false,
  });
  const [addOrgLoading, setAddOrgLoading] = useState(false);
  const [addOrgError, setAddOrgError] = useState(null);
  const [addOrgSuccess, setAddOrgSuccess] = useState(null);

  // Brand Form State
  const [brandForm, setBrandForm] = useState({
    name: '',
    company: '',
    owner: '',
    primary: '#0ea5e9',
    accent: '#f59e0b',
    fontDisplay: 'Figtree',
    fontBody: 'Figtree',
    logo: '',
  });
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandError, setBrandError] = useState(null);

  // Research State
  const [researchForm, setResearchForm] = useState({
    name: '',
    company: '',
    context: '',
    project: '',
  });
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchStage, setResearchStage] = useState('');
  const [researchResult, setResearchResult] = useState(null);
  const [researchError, setResearchError] = useState(null);
  const [copiedBriefing, setCopiedBriefing] = useState(false);

  // Merge State
  const [mergeForm, setMergeForm] = useState({
    type: 'org',
    sourceSlug: '',
    targetSlug: '',
  });
  const [isConfirmMergeOpen, setIsConfirmMergeOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const [mergeError, setMergeError] = useState(null);

  // Load All Entities
  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      window.dori?.call('list_orgs', {}).catch(() => []),
      window.dori?.call('list_people', {}).catch(() => []),
      window.dori?.call('list_brands', {}).catch(() => []),
    ]).then(([orgsData, peopleData, brandsData]) => {
      setOrgs(orgsData || []);
      setPeople(peopleData || []);
      setBrands(brandsData || []);
      setLoading(false);
    }).catch(() => {
      setOrgs([]);
      setPeople([]);
      setBrands([]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtered Accounts / Orgs
  const filteredAccounts = useMemo(() => {
    if (!orgs) return [];
    const q = accountQuery.trim().toLowerCase();
    return orgs.filter((o) => {
      if (accountKindFilter !== 'all') {
        const k = (o.accountKind || o.role || '').toLowerCase();
        if (!k.includes(accountKindFilter)) return false;
      }
      if (q) {
        const matchName = o.name?.toLowerCase().includes(q);
        const matchDomain = o.domain?.toLowerCase().includes(q);
        const matchSummary = o.summary?.toLowerCase().includes(q);
        const matchPeople = o.people?.some((p) => p.toLowerCase().includes(q));
        return matchName || matchDomain || matchSummary || matchPeople;
      }
      return true;
    });
  }, [orgs, accountQuery, accountKindFilter]);

  // Filtered People
  const filteredPeople = useMemo(() => {
    if (!people) return [];
    const q = peopleQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const matchName = p.name?.toLowerCase().includes(q);
      const matchRole = p.role?.toLowerCase().includes(q);
      const matchOrg = p.org?.toLowerCase().includes(q);
      const matchSummary = p.summary?.toLowerCase().includes(q);
      return matchName || matchRole || matchOrg || matchSummary;
    });
  }, [people, peopleQuery]);

  // Filtered Brands
  const filteredBrands = useMemo(() => {
    if (!brands) return [];
    const q = brandQuery.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => {
      const matchName = b.name?.toLowerCase().includes(q);
      const matchCompany = b.company?.toLowerCase().includes(q);
      const matchOwner = b.owner?.toLowerCase().includes(q);
      return matchName || matchCompany || matchOwner;
    });
  }, [brands, brandQuery]);

  // Open Guidelines Drawer
  const handleOpenGuidelines = async (brandName) => {
    setIsGuidelinesOpen(true);
    setGuidelinesLoading(true);
    setGuidelinesData(null);
    try {
      const data = await window.dori?.call('get_brand', { name: brandName });
      setGuidelinesData(data);
    } catch (err) {
      console.warn('Failed to load brand guidelines:', err);
    } finally {
      setGuidelinesLoading(false);
    }
  };

  // Run Research
  const handleRunResearch = async (e) => {
    e.preventDefault();
    if (!researchForm.name.trim()) return;
    setResearchLoading(true);
    setResearchError(null);
    setResearchResult(null);
    setResearchStage('Cross-referencing vault relationships…');

    try {
      const result = await window.dori?.call('research_and_recommend', {
        name: researchForm.name.trim(),
        company: researchForm.company.trim() || undefined,
        context: researchForm.context.trim() || undefined,
        project: researchForm.project.trim() || undefined,
      });
      setResearchResult(result);
    } catch (err) {
      setResearchError(err.message || 'Research synthesis failed');
    } finally {
      setResearchLoading(false);
    }
  };

  // Submit Add Org Form
  const handleAddOrgSubmit = async (e) => {
    e.preventDefault();
    if (!newOrgForm.orgName.trim()) return;
    setAddOrgLoading(true);
    setAddOrgError(null);
    setAddOrgSuccess(null);

    try {
      const res = await window.dori?.call('ensure_org', {
        orgName: newOrgForm.orgName.trim(),
        role: newOrgForm.role,
        personName: newOrgForm.personName.trim() || undefined,
        personSlug: newOrgForm.personSlug.trim() || undefined,
        evidenceText: newOrgForm.evidenceText.trim() || undefined,
        requireEvidence: newOrgForm.requireEvidence,
      });

      if (res?.success) {
        setAddOrgSuccess(res.created ? `Organization "${res.orgName}" created successfully.` : `Linked to existing organization "${res.orgName}".`);
        setTimeout(() => {
          setIsAddOrgOpen(false);
          setAddOrgSuccess(null);
          setNewOrgForm({
            orgName: '',
            role: 'client',
            personName: '',
            personSlug: '',
            evidenceText: '',
            requireEvidence: false,
          });
          refresh();
        }, 1200);
      } else {
        setAddOrgError(res?.reason || 'Failed to add organization');
      }
    } catch (err) {
      setAddOrgError(err.message || 'An error occurred');
    } finally {
      setAddOrgLoading(false);
    }
  };

  // Submit Brand Form
  const handleBrandSubmit = async (e) => {
    e.preventDefault();
    if (!brandForm.name.trim()) return;
    setBrandSaving(true);
    setBrandError(null);

    try {
      await window.dori?.call('set_brand', {
        name: brandForm.name.trim(),
        company: brandForm.company.trim() || undefined,
        owner: brandForm.owner.trim() || undefined,
        primary: brandForm.primary || undefined,
        accent: brandForm.accent || undefined,
        fontDisplay: brandForm.fontDisplay || undefined,
        fontBody: brandForm.fontBody || undefined,
        logo: brandForm.logo.trim() || undefined,
      });
      setIsBrandModalOpen(false);
      refresh();
    } catch (err) {
      setBrandError(err.message || 'Failed to save brand');
    } finally {
      setBrandSaving(false);
    }
  };

  // Submit Entity Merge
  const handleExecuteMerge = async () => {
    if (!mergeForm.sourceSlug || !mergeForm.targetSlug) return;
    setMergeLoading(true);
    setMergeError(null);
    setMergeResult(null);

    try {
      const res = await window.dori?.call('merge_entity', {
        type: mergeForm.type,
        sourceSlug: mergeForm.sourceSlug.trim(),
        targetSlug: mergeForm.targetSlug.trim(),
      });
      setMergeResult(res);
      setIsConfirmMergeOpen(false);
      refresh();
    } catch (err) {
      setMergeError(err.message || 'Entity merge failed');
    } finally {
      setMergeLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame space-y-6">
        <RouteHeader
          title="Entities & Directory"
          description="Manage client accounts, relationships, brand design tokens, people directory, and research."
          meta={
            orgs ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--brand-accent-text)]">
                  {orgs.length} Account{orgs.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--brand-accent-text)]">
                  {people?.length || 0} People
                </span>
                <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--brand-accent-text)]">
                  {brands?.length || 0} Brand{brands?.length === 1 ? '' : 's'}
                </span>
              </div>
            ) : null
          }
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCredentialsOpen(true)}
                className="h-9 gap-2 text-sm font-medium border-border-soft hover:bg-[var(--space-nav-hover)] shadow-2xs"
              >
                <Key size={15} className="text-amber-500" />
                Credentials Vault
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                className="h-9 gap-2 text-sm font-medium border-border-soft hover:bg-[var(--space-nav-hover)] shadow-2xs"
              >
                <RefreshCw size={15} />
                Refresh
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsAddOrgOpen(true)}
                className="h-9 gap-2 text-sm font-semibold bg-[var(--brand-primary)] text-white hover:opacity-90 shadow-2xs"
              >
                <Plus size={15} strokeWidth={2.5} />
                Add Account
              </Button>
            </div>
          }
        />

        {/* Unified Tab Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-muted/80 p-1.5 text-muted-foreground">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all cursor-pointer',
                    isSelected
                      ? 'bg-card text-foreground font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card/40'
                  )}
                >
                  <Icon size={16} strokeWidth={isSelected ? 2.4 : 2} className={isSelected ? 'text-[var(--brand-primary)]' : ''} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: ACCOUNTS & ORGANIZATIONS */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {ACCOUNT_STATUS_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setAccountKindFilter(chip.id)}
                    className={cn(
                      'rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all border cursor-pointer',
                      accountKindFilter === chip.id
                        ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] font-bold shadow-xs'
                        : 'bg-card text-foreground-secondary border-border hover:bg-[var(--space-nav-hover)] hover:text-foreground'
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-sm">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                  placeholder="Search accounts, domains, contacts…"
                  className="h-10 pl-9 text-sm bg-card border-border rounded-lg font-medium"
                />
              </div>
            </div>

            {/* Skeleton Loading */}
            {loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredAccounts.length === 0 && (
              <EmptyState
                icon={Building2}
                title={orgs?.length === 0 ? 'No accounts recorded yet' : 'No matching accounts'}
                description={
                  orgs?.length === 0
                    ? 'Accounts in accounts/ or entities/organizations/ will appear here automatically.'
                    : 'Try adjusting your search query or role filter.'
                }
              />
            )}

            {/* Accounts Grid */}
            {!loading && filteredAccounts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredAccounts.map((account) => {
                  const statusBadge = getStatusBadge(account.relationshipStatus);
                  const kindBadge = getKindBadge(account.accountKind || account.role);

                  return (
                    <div
                      key={account.slug}
                      onClick={() => onSelectDocument?.(account.relPath)}
                      className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-foreground/25 hover:shadow-md cursor-pointer"
                    >
                      <div className="space-y-3.5">
                        {/* Card Top Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)] text-[var(--brand-accent)] shadow-2xs group-hover:bg-[var(--brand-primary)] group-hover:text-white transition-colors">
                            <Building2 size={22} strokeWidth={2} />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold border', kindBadge.color)}>
                              {kindBadge.label}
                            </span>
                            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold border', statusBadge.color)}>
                              {statusBadge.label}
                            </span>
                          </div>
                        </div>

                        {/* Account Title & Domain */}
                        <div>
                          <h3 className="text-[17px] font-bold text-foreground group-hover:text-[var(--brand-primary)] transition-colors leading-snug tracking-tight">
                            {account.name}
                          </h3>
                          {account.domain && (
                            <p className="mt-0.5 text-[12px] font-mono text-muted-foreground uppercase tracking-wider font-semibold">
                              {account.domain}
                            </p>
                          )}
                        </div>

                        {/* Summary */}
                        {account.summary && (
                          <p className="text-[14px] text-foreground-secondary line-clamp-3 leading-relaxed font-normal">
                            {account.summary}
                          </p>
                        )}

                        {/* Linked People Contacts Roster */}
                        {account.peopleDetails && account.peopleDetails.length > 0 && (
                          <div className="pt-2.5 border-t border-border/80 space-y-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Key Contacts ({account.peopleDetails.length})
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {account.peopleDetails.map((person) => (
                                <span
                                  key={person.slug}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectDocument?.(person.relPath);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-muted/80 px-2.5 py-1 text-[13px] font-medium text-foreground hover:bg-muted border border-border transition-colors"
                                >
                                  <User size={13} className="text-muted-foreground" />
                                  <span>{person.name}</span>
                                  {person.role && (
                                    <span className="text-muted-foreground text-[12px]">({person.role})</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-[13px] text-foreground-secondary font-medium">
                        <span className="font-mono text-xs truncate max-w-[200px] text-muted-foreground">
                          {account.relPath}
                        </span>
                        <div className="flex items-center gap-1 text-[var(--brand-primary)] font-bold group-hover:translate-x-0.5 transition-transform">
                          <span>Inspect</span>
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PEOPLE DIRECTORY */}
        {activeTab === 'people' && (
          <div className="space-y-6">
            {/* Filter & Search Bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-full max-w-md">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={peopleQuery}
                  onChange={(e) => setPeopleQuery(e.target.value)}
                  placeholder="Search people by name, role, organization, bio…"
                  className="h-10 pl-9 text-sm bg-card border-border-soft rounded-control"
                />
              </div>

              <span className="text-sm text-muted-foreground font-medium">
                {filteredPeople.length} contact{filteredPeople.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Skeleton Loading */}
            {loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <Skeleton className="h-44 w-full rounded-panel" />
                <Skeleton className="h-44 w-full rounded-panel" />
                <Skeleton className="h-44 w-full rounded-panel" />
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredPeople.length === 0 && (
              <EmptyState
                icon={Users}
                title="No contacts found"
                description="People recorded in entities/people/*.md will appear here."
              />
            )}

            {/* People Grid */}
            {!loading && filteredPeople.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPeople.map((person) => {
                  const initials = person.name
                    ? person.name.split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
                    : 'U';

                  return (
                    <div
                      key={person.slug}
                      onClick={() => onSelectDocument?.(person.relPath)}
                      className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-foreground/25 hover:shadow-md cursor-pointer"
                    >
                      <div className="space-y-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--brand-primary)] font-bold text-sm shadow-2xs group-hover:bg-[var(--brand-primary)] group-hover:text-white transition-colors">
                            {initials}
                          </div>
                          {person.relationship && (
                            <Badge variant="muted" size="compact" className="text-xs font-semibold">
                              {person.relationship}
                            </Badge>
                          )}
                        </div>

                        <div>
                          <h3 className="text-[17px] font-bold text-foreground group-hover:text-[var(--brand-primary)] transition-colors leading-snug tracking-tight">
                            {person.name}
                          </h3>
                          <div className="mt-1 flex items-center gap-2 flex-wrap text-[13.5px] text-foreground-secondary">
                            {person.role && <span className="font-semibold text-foreground">{person.role}</span>}
                            {person.role && person.org && <span className="text-muted-foreground">•</span>}
                            {person.org && (
                              <span className="inline-flex items-center gap-1 font-semibold text-[var(--brand-primary)]">
                                <Building2 size={14} />
                                {person.org}
                              </span>
                            )}
                          </div>
                        </div>

                        {person.summary && (
                          <p className="text-[14px] text-foreground-secondary line-clamp-3 leading-relaxed font-normal">
                            {person.summary}
                          </p>
                        )}
                      </div>

                      <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-[13px] text-muted-foreground">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResearchForm({
                              name: person.name,
                              company: person.org || '',
                              context: person.role || '',
                              project: '',
                            });
                            setActiveTab('research');
                          }}
                          className="h-8 px-2.5 text-[13px] font-bold text-[var(--brand-primary)] hover:bg-[var(--surface-tint)]"
                        >
                          <Search size={13} className="mr-1.5" />
                          Research
                        </Button>

                        <div className="flex items-center gap-1 text-[var(--brand-primary)] font-bold group-hover:translate-x-0.5 transition-transform">
                          <span>Inspect</span>
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BRANDS */}
        {activeTab === 'brands' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-full max-w-md">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                  placeholder="Search brands, companies, owners…"
                  className="h-10 pl-9 text-sm bg-card border-border rounded-lg font-medium"
                />
              </div>

              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditingBrand(null);
                  setBrandForm({
                    name: '',
                    company: '',
                    owner: '',
                    primary: '#0ea5e9',
                    accent: '#f59e0b',
                    fontDisplay: 'Figtree',
                    fontBody: 'Figtree',
                    logo: '',
                  });
                  setIsBrandModalOpen(true);
                }}
                className="h-9 gap-2 text-sm font-semibold bg-[var(--brand-primary)] text-white shadow-2xs"
              >
                <Plus size={15} strokeWidth={2.5} />
                New Brand
              </Button>
            </div>

            {/* Brands Grid */}
            {!loading && filteredBrands.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredBrands.map((brand) => (
                  <div
                    key={brand.slug}
                    className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-foreground/25 hover:shadow-md"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)] text-[var(--brand-accent)] shadow-2xs">
                          <Sparkles size={22} strokeWidth={2} />
                        </div>
                        <Badge variant="muted" size="compact" className="text-xs font-semibold">
                          Brand Theme
                        </Badge>
                      </div>

                      <div>
                        <h3 className="text-[17px] font-bold text-foreground leading-snug tracking-tight">
                          {brand.name}
                        </h3>
                        {brand.company && (
                          <p className="mt-0.5 text-[13.5px] text-muted-foreground font-semibold">
                            {brand.company}
                          </p>
                        )}
                      </div>

                      {/* Color Palette Swatches */}
                      <div className="space-y-1.5 pt-2.5 border-t border-border">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Theme Tokens
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 rounded-lg bg-muted/80 px-3 py-1.5 border border-border">
                            <span className="h-4 w-4 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: brand.primary || '#0ea5e9' }} />
                            <span className="text-xs font-mono font-bold text-foreground">{brand.primary || '#0ea5e9'}</span>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg bg-muted/80 px-3 py-1.5 border border-border">
                            <span className="h-4 w-4 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: brand.accent || '#f59e0b' }} />
                            <span className="text-xs font-mono font-bold text-foreground">{brand.accent || '#f59e0b'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Typography */}
                      <div className="flex items-center gap-4 text-[13px] text-foreground-secondary font-medium">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <Type size={14} className="text-muted-foreground" />
                          Display: {brand.fontDisplay || 'Figtree'}
                        </span>
                        <span className="flex items-center gap-1.5 font-semibold">
                          Body: {brand.fontBody || 'Figtree'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenGuidelines(brand.name)}
                        className="h-8 px-3 text-[13px] font-bold border-border hover:bg-[var(--space-nav-hover)]"
                      >
                        <FileText size={14} className="mr-1.5 text-[var(--brand-primary)]" />
                        Guidelines & Voice
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingBrand(brand);
                          setBrandForm({
                            name: brand.name,
                            company: brand.company || '',
                            owner: brand.owner || '',
                            primary: brand.primary || '#0ea5e9',
                            accent: brand.accent || '#f59e0b',
                            fontDisplay: brand.fontDisplay || 'Figtree',
                            fontBody: brand.fontBody || 'Figtree',
                            logo: brand.logo || '',
                          });
                          setIsBrandModalOpen(true);
                        }}
                        className="h-8 px-3 text-[13px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: RESEARCH & BRIEFING */}
        {activeTab === 'research' && (
          <div className="space-y-6">
            <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-2xs space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Contextual Research & Meeting Briefing
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Synthesize external web intelligence (via Tavily) with internal vault relationships, colleagues, and documents.
                </p>
              </div>

              <form onSubmit={handleRunResearch} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Full Name *
                    </label>
                    <Input
                      value={researchForm.name}
                      onChange={(e) => setResearchForm({ ...researchForm, name: e.target.value })}
                      placeholder="e.g. Deepa Bachu, Anita Sharma"
                      required
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Company / Organization
                    </label>
                    <Input
                      value={researchForm.company}
                      onChange={(e) => setResearchForm({ ...researchForm, company: e.target.value })}
                      placeholder="e.g. RippleMun, Google, Meridian"
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Extra Context (Optional)
                    </label>
                    <Input
                      value={researchForm.context}
                      onChange={(e) => setResearchForm({ ...researchForm, context: e.target.value })}
                      placeholder="e.g. Founder, CFO, discussing AI intervention"
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Project Link (Optional)
                    </label>
                    <Input
                      value={researchForm.project}
                      onChange={(e) => setResearchForm({ ...researchForm, project: e.target.value })}
                      placeholder="e.g. platform, consulting"
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={researchLoading || !researchForm.name.trim()}
                    className="h-10 px-5 gap-2 text-sm font-semibold bg-[var(--brand-primary)] text-white shadow-2xs"
                  >
                    {researchLoading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                    <span>{researchLoading ? 'Synthesizing Briefing…' : 'Generate Briefing'}</span>
                  </Button>
                </div>
              </form>
            </div>

            {/* Research Results */}
            {researchError && (
              <div className="rounded-panel border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 font-medium">
                {researchError}
              </div>
            )}

            {researchResult && (
              <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-2xs space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{researchResult.name}</h3>
                    <p className="text-sm text-muted-foreground font-medium mt-0.5">
                      {researchResult.company || 'Independent / Unknown'}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(researchResult, null, 2));
                      setCopiedBriefing(true);
                      setTimeout(() => setCopiedBriefing(false), 2000);
                    }}
                    className="h-9 gap-2 text-sm font-medium border-border-soft"
                  >
                    {copiedBriefing ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                    <span>{copiedBriefing ? 'Copied JSON' : 'Copy Briefing'}</span>
                  </Button>
                </div>

                {/* Relationship Status Banner */}
                <div className="rounded-control border border-border-soft bg-[var(--surface-field)] p-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--brand-primary)]">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      {researchResult.existingRelationship ? 'Known Vault Relationship' : 'New Contact / Cold Relationship'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {researchResult.existingRelationship
                        ? `Found records linked to ${researchResult.company || 'organization'} in your vault.`
                        : 'No prior organizational relationship record was found in the vault.'}
                    </p>
                  </div>
                </div>

                {/* Known Colleagues */}
                {researchResult.knownColleagues && researchResult.knownColleagues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Known Vault Colleagues ({researchResult.knownColleagues.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {researchResult.knownColleagues.map((c, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-control bg-[var(--surface-field)] px-3 py-1.5 text-xs font-medium text-foreground border border-border-soft">
                          <User size={13} className="text-muted-foreground" />
                          <span>{c.name || c}</span>
                          {c.role && <span className="text-muted-foreground">({c.role})</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Documents */}
                {researchResult.relatedDocs && researchResult.relatedDocs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Related Vault Documents ({researchResult.relatedDocs.length})
                    </h4>
                    <div className="space-y-1.5">
                      {researchResult.relatedDocs.map((doc, idx) => (
                        <div
                          key={idx}
                          onClick={() => onSelectDocument?.(doc.rel_path || doc.relPath)}
                          className="flex items-center justify-between rounded-control border border-border-soft bg-[var(--surface-field)] p-3 hover:bg-[var(--space-nav-hover)] cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <FileText size={15} className="text-[var(--brand-primary)] shrink-0" />
                            <span className="text-sm font-medium text-foreground">{doc.title || doc.rel_path}</span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{doc.rel_path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Web Research Hits */}
                {researchResult.webResults && researchResult.webResults.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Web Intelligence Snippets ({researchResult.webResults.length})
                    </h4>
                    <div className="space-y-2.5">
                      {researchResult.webResults.map((hit, idx) => (
                        <div key={idx} className="rounded-control border border-border-soft bg-[var(--surface-field)] p-3.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-sm font-semibold text-foreground">{hit.title}</h5>
                            {hit.url && (
                              <a href={hit.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--brand-primary)] hover:underline flex items-center gap-1">
                                <span>Link</span>
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-foreground-secondary leading-relaxed">{hit.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ENTITY MERGING */}
        {activeTab === 'merge' && (
          <div className="space-y-6">
            <div className="rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-2xs space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Non-Destructive Entity Deduplication & Merging
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Safely merge duplicate Person or Organization records. The source entity is archived with redirection, aliases are unioned, and vault cross-references are rewritten.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Entity Type
                  </label>
                  <select
                    value={mergeForm.type}
                    onChange={(e) => setMergeForm({ ...mergeForm, type: e.target.value, sourceSlug: '', targetSlug: '' })}
                    className="w-full h-10 px-3 text-sm bg-[var(--surface-field)] border border-border-soft rounded-control text-foreground"
                  >
                    <option value="org">Organization</option>
                    <option value="person">Person</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Duplicate Entity (Source)
                  </label>
                  <select
                    value={mergeForm.sourceSlug}
                    onChange={(e) => setMergeForm({ ...mergeForm, sourceSlug: e.target.value })}
                    className="w-full h-10 px-3 text-sm bg-[var(--surface-field)] border border-border-soft rounded-control text-foreground"
                  >
                    <option value="">Select duplicate...</option>
                    {(mergeForm.type === 'org' ? orgs || [] : people || []).map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.name} ({item.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Canonical Entity (Target)
                  </label>
                  <select
                    value={mergeForm.targetSlug}
                    onChange={(e) => setMergeForm({ ...mergeForm, targetSlug: e.target.value })}
                    className="w-full h-10 px-3 text-sm bg-[var(--surface-field)] border border-border-soft rounded-control text-foreground"
                  >
                    <option value="">Select canonical target...</option>
                    {(mergeForm.type === 'org' ? orgs || [] : people || []).map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.name} ({item.slug})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {mergeError && (
                <div className="rounded-control border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 font-medium">
                  {mergeError}
                </div>
              )}

              {mergeResult && (
                <div className="rounded-control border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2 text-xs text-emerald-700">
                  <h5 className="font-semibold text-sm">Merge Executed Successfully</h5>
                  <p>Archived {mergeResult.archivedSource} and unioned aliases into {mergeResult.targetFile}.</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  disabled={!mergeForm.sourceSlug || !mergeForm.targetSlug || mergeForm.sourceSlug === mergeForm.targetSlug || mergeLoading}
                  onClick={() => setIsConfirmMergeOpen(true)}
                  className="h-10 px-5 gap-2 text-sm font-semibold bg-[var(--brand-primary)] text-white shadow-2xs"
                >
                  <GitMerge size={15} />
                  <span>Preview & Merge</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD ORGANIZATION */}
        {isAddOrgOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-lg rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-[var(--brand-primary)]" />
                  <h3 className="text-lg font-semibold text-foreground">Add Account / Organization</h3>
                </div>
                <button onClick={() => setIsAddOrgOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddOrgSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Organization Name *
                  </label>
                  <Input
                    value={newOrgForm.orgName}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, orgName: e.target.value })}
                    placeholder="e.g. Meridian Solutions, Acme Corp"
                    required
                    className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Relationship Role
                    </label>
                    <select
                      value={newOrgForm.role}
                      onChange={(e) => setNewOrgForm({ ...newOrgForm, role: e.target.value })}
                      className="w-full h-10 px-3 text-sm bg-[var(--surface-field)] border border-border-soft rounded-control text-foreground"
                    >
                      <option value="client">Client</option>
                      <option value="prospect">Prospect</option>
                      <option value="collaborator">Collaborator</option>
                      <option value="founder-advisory">Advisory</option>
                      <option value="vendor">Vendor</option>
                      <option value="partner">Partner</option>
                      <option value="none">Unspecified</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Linked Contact Name
                    </label>
                    <Input
                      value={newOrgForm.personName}
                      onChange={(e) => setNewOrgForm({ ...newOrgForm, personName: e.target.value })}
                      placeholder="e.g. Anita Sharma"
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Affiliation Evidence Text (Optional)
                  </label>
                  <textarea
                    value={newOrgForm.evidenceText}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, evidenceText: e.target.value })}
                    placeholder='e.g. "Anita Sharma, CFO at Meridian"'
                    rows={3}
                    className="w-full p-3 text-sm bg-[var(--surface-field)] border border-border-soft rounded-control text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                </div>

                {addOrgError && (
                  <div className="rounded-control border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 font-medium">
                    {addOrgError}
                  </div>
                )}

                {addOrgSuccess && (
                  <div className="rounded-control border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 font-medium">
                    {addOrgSuccess}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddOrgOpen(false)}
                    className="h-9 px-4 text-sm font-medium border-border-soft"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={addOrgLoading || !newOrgForm.orgName.trim()}
                    className="h-9 px-5 text-sm font-semibold bg-[var(--brand-primary)] text-white shadow-2xs"
                  >
                    {addOrgLoading ? 'Saving…' : 'Save Organization'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: BRAND GUIDELINES DRAWER */}
        {isGuidelinesOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-2xl rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-xl space-y-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[var(--brand-primary)]" />
                  <h3 className="text-lg font-semibold text-foreground">Brand Guidelines & Voice Context</h3>
                </div>
                <button onClick={() => setIsGuidelinesOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>

              {guidelinesLoading && <Skeleton className="h-48 w-full rounded-panel" />}

              {guidelinesData && (
                <div className="space-y-4">
                  <div className="rounded-control border border-border-soft bg-[var(--surface-field)] p-4 space-y-2">
                    <h4 className="text-base font-bold text-foreground">{guidelinesData.name}</h4>
                    {guidelinesData.company && (
                      <p className="text-xs text-muted-foreground font-medium">Company: {guidelinesData.company}</p>
                    )}
                  </div>

                  {guidelinesData.contextPrompt && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Context Prompt Block
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(guidelinesData.contextPrompt);
                            setCopiedPrompt(true);
                            setTimeout(() => setCopiedPrompt(false), 2000);
                          }}
                          className="h-7 px-2 text-xs font-medium text-[var(--brand-primary)]"
                        >
                          {copiedPrompt ? <Check size={13} className="mr-1 text-emerald-500" /> : <Copy size={13} className="mr-1" />}
                          <span>{copiedPrompt ? 'Copied' : 'Copy Prompt'}</span>
                        </Button>
                      </div>
                      <pre className="p-4 text-xs font-mono bg-[var(--surface-field)] border border-border-soft rounded-control overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground-secondary">
                        {guidelinesData.contextPrompt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: BRAND CREATE / EDIT */}
        {isBrandModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-lg rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-[var(--space-sidebar-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[var(--brand-primary)]" />
                  <h3 className="text-lg font-semibold text-foreground">
                    {editingBrand ? 'Edit Brand' : 'Create Brand'}
                  </h3>
                </div>
                <button onClick={() => setIsBrandModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleBrandSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Brand Name *
                  </label>
                  <Input
                    value={brandForm.name}
                    onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                    placeholder="e.g. Dori, Aura, Acme"
                    required
                    disabled={!!editingBrand}
                    className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Company
                    </label>
                    <Input
                      value={brandForm.company}
                      onChange={(e) => setBrandForm({ ...brandForm, company: e.target.value })}
                      placeholder="e.g. Dori Inc"
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Owner Slug
                    </label>
                    <Input
                      value={brandForm.owner}
                      onChange={(e) => setBrandForm({ ...brandForm, owner: e.target.value })}
                      placeholder="e.g. shrinath-v"
                      className="h-10 text-sm bg-[var(--surface-field)] border-border-soft"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandForm.primary}
                        onChange={(e) => setBrandForm({ ...brandForm, primary: e.target.value })}
                        className="h-10 w-12 rounded-control border border-border-soft cursor-pointer bg-[var(--surface-field)]"
                      />
                      <Input
                        value={brandForm.primary}
                        onChange={(e) => setBrandForm({ ...brandForm, primary: e.target.value })}
                        className="h-10 text-sm font-mono bg-[var(--surface-field)] border-border-soft"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandForm.accent}
                        onChange={(e) => setBrandForm({ ...brandForm, accent: e.target.value })}
                        className="h-10 w-12 rounded-control border border-border-soft cursor-pointer bg-[var(--surface-field)]"
                      />
                      <Input
                        value={brandForm.accent}
                        onChange={(e) => setBrandForm({ ...brandForm, accent: e.target.value })}
                        className="h-10 text-sm font-mono bg-[var(--surface-field)] border-border-soft"
                      />
                    </div>
                  </div>
                </div>

                {brandError && (
                  <div className="rounded-control border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 font-medium">
                    {brandError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsBrandModalOpen(false)}
                    className="h-9 px-4 text-sm font-medium border-border-soft"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={brandSaving || !brandForm.name.trim()}
                    className="h-9 px-5 text-sm font-semibold bg-[var(--brand-primary)] text-white shadow-2xs"
                  >
                    {brandSaving ? 'Saving…' : 'Save Brand'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: CONFIRM MERGE */}
        {isConfirmMergeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-md rounded-panel border border-[var(--space-sidebar-border)] bg-card p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle size={20} />
                <h3 className="text-lg font-bold text-foreground">Confirm Entity Merge</h3>
              </div>

              <p className="text-sm text-foreground-secondary leading-relaxed">
                You are about to merge <strong className="text-foreground">{mergeForm.sourceSlug}</strong> into <strong className="text-foreground">{mergeForm.targetSlug}</strong>.
              </p>

              <div className="rounded-control border border-border-soft bg-[var(--surface-field)] p-3 text-xs text-muted-foreground space-y-1">
                <p>• The source file will be archived in <code className="text-foreground font-mono">merged/</code> with a redirection marker.</p>
                <p>• Aliases and linked people will be unioned into the canonical entity.</p>
                <p>• Vault references across organizations and brands will be updated.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsConfirmMergeOpen(false)}
                  className="h-9 px-4 text-sm font-medium border-border-soft"
                >
                  Cancel
                </Button>
                <Button
                  disabled={mergeLoading}
                  onClick={handleExecuteMerge}
                  className="h-9 px-5 text-sm font-semibold bg-[var(--brand-primary)] text-white shadow-2xs"
                >
                  {mergeLoading ? 'Merging…' : 'Confirm & Execute'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Credentials Modal */}
        <CredentialsModal
          isOpen={isCredentialsOpen}
          onClose={() => setIsCredentialsOpen(false)}
        />
      </div>
    </div>
  );
}
