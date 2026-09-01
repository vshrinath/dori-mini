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
  Edit3,
  Eye
} from 'lucide-react';
import { RouteHeader } from './ui/RouteHeader.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { FilterChip } from './ui/filter-chip.jsx';
import { Input } from './ui/input.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { CredentialsModal } from './CredentialsModal.jsx';
import { cn } from '../lib/utils.js';

const TABS = [
  { id: 'orgs', label: 'Organizations', icon: Building2 },
  { id: 'brands', label: 'Brands', icon: Sparkles },
  { id: 'research', label: 'People & Research', icon: Search },
  { id: 'merge', label: 'Entity Merging', icon: GitMerge },
];

const ORG_ROLES = [
  { id: 'all', label: 'All Roles' },
  { id: 'client', label: 'Clients', badgeVariant: 'default', colorClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  { id: 'vendor', label: 'Vendors', badgeVariant: 'outline', colorClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { id: 'partner', label: 'Partners', badgeVariant: 'secondary', colorClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { id: 'employer', label: 'Employers', badgeVariant: 'secondary', colorClass: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  { id: 'none', label: 'Unspecified', badgeVariant: 'muted', colorClass: 'bg-muted text-muted-foreground border-border-soft' },
];

export function EntitiesView({ onSelectDocument }) {
  const [activeTab, setActiveTab] = useState('orgs');
  const [orgs, setOrgs] = useState(null);
  const [brands, setBrands] = useState(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [orgQuery, setOrgQuery] = useState('');
  const [orgRoleFilter, setOrgRoleFilter] = useState('all');
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

  // Load Initial Entities Data
  const refresh = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      window.dori?.call('list_orgs', {}),
      window.dori?.call('list_brands', {}),
    ])
      .then(([orgsRes, brandsRes]) => {
        setOrgs(orgsRes.status === 'fulfilled' ? orgsRes.value || [] : []);
        setBrands(brandsRes.status === 'fulfilled' ? brandsRes.value || [] : []);
      })
      .catch((e) => {
        console.error('Error loading entities:', e);
        setOrgs([]);
        setBrands([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Total Counts
  const totalOrgs = orgs?.length || 0;
  const totalBrands = brands?.length || 0;

  // Filtered Organizations
  const filteredOrgs = useMemo(() => {
    if (!orgs) return [];
    const q = orgQuery.trim().toLowerCase();
    return orgs.filter((o) => {
      const matchRole = orgRoleFilter === 'all' || (o.role || 'none') === orgRoleFilter;
      const matchQuery =
        !q ||
        o.name?.toLowerCase().includes(q) ||
        o.role?.toLowerCase().includes(q) ||
        o.evidence?.toLowerCase().includes(q) ||
        (Array.isArray(o.people) && o.people.some((p) => p.toLowerCase().includes(q)));
      return matchRole && matchQuery;
    });
  }, [orgs, orgQuery, orgRoleFilter]);

  // Filtered Brands
  const filteredBrands = useMemo(() => {
    if (!brands) return [];
    const q = brandQuery.trim().toLowerCase();
    return brands.filter(
      (b) =>
        !q ||
        b.name?.toLowerCase().includes(q) ||
        b.company?.toLowerCase().includes(q) ||
        b.owner?.toLowerCase().includes(q)
    );
  }, [brands, brandQuery]);

  // Handle Add Organization Submit
  const handleAddOrgSubmit = async (e) => {
    e.preventDefault();
    if (!newOrgForm.orgName.trim()) return;
    setAddOrgLoading(true);
    setAddOrgError(null);
    setAddOrgSuccess(null);

    const payload = {
      orgName: newOrgForm.orgName.trim(),
      role: newOrgForm.role,
      requireEvidence: Boolean(newOrgForm.requireEvidence),
      ...(newOrgForm.personName ? { personName: newOrgForm.personName.trim() } : {}),
      ...(newOrgForm.personSlug ? { personSlug: newOrgForm.personSlug.trim() } : {}),
      ...(newOrgForm.evidenceText ? { evidenceText: newOrgForm.evidenceText.trim() } : {}),
    };

    try {
      const res = await window.dori?.call('ensure_org', payload);
      if (res?.success) {
        setAddOrgSuccess(res.created ? 'Organization created successfully!' : 'Organization updated and linked!');
        refresh();
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
        }, 1200);
      } else {
        if (res?.reason === 'affiliation_evidence_not_cleared') {
          setAddOrgError(
            'Affiliation evidence did not clear the verification bar. Must match patterns like "Anita, CFO at Meridian" or "Anita works as CFO for Meridian". You can uncheck "Strict Affiliation Evidence" below to bypass.'
          );
        } else if (res?.reason === 'evidence_and_person_name_required') {
          setAddOrgError('Person name and evidence text are required when strict evidence check is enabled.');
        } else {
          setAddOrgError(res?.reason || 'Failed to save organization.');
        }
      }
    } catch (err) {
      console.error('Failed to ensure org:', err);
      setAddOrgError(err.message || 'Error executing ensure_org');
    } finally {
      setAddOrgLoading(false);
    }
  };

  // Open Edit Brand Modal
  const handleOpenEditBrand = (brand = null) => {
    if (brand) {
      setEditingBrand(brand);
      setBrandForm({
        name: brand.name || '',
        company: brand.company || '',
        owner: brand.owner || '',
        primary: brand.primary || '#0ea5e9',
        accent: brand.accent || '#f59e0b',
        fontDisplay: brand.fontDisplay || 'Figtree',
        fontBody: brand.fontBody || 'Figtree',
        logo: brand.logo || '',
      });
    } else {
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
    }
    setBrandError(null);
    setIsBrandModalOpen(true);
  };

  // Handle Save Brand Submit
  const handleSaveBrandSubmit = async (e) => {
    e.preventDefault();
    if (!brandForm.name.trim()) return;
    setBrandSaving(true);
    setBrandError(null);

    const payload = {
      name: brandForm.name.trim(),
      ...(brandForm.company ? { company: brandForm.company.trim() } : {}),
      ...(brandForm.owner ? { owner: brandForm.owner.trim() } : {}),
      ...(brandForm.primary ? { primary: brandForm.primary.trim() } : {}),
      ...(brandForm.accent ? { accent: brandForm.accent.trim() } : {}),
      ...(brandForm.fontDisplay ? { fontDisplay: brandForm.fontDisplay.trim() } : {}),
      ...(brandForm.fontBody ? { fontBody: brandForm.fontBody.trim() } : {}),
      ...(brandForm.logo ? { logo: brandForm.logo.trim() } : {}),
    };

    try {
      const res = await window.dori?.call('set_brand', payload);
      if (res?.slug || res?.saved !== false) {
        refresh();
        setIsBrandModalOpen(false);
      } else {
        setBrandError('Failed to save brand.');
      }
    } catch (err) {
      console.error('Failed to save brand:', err);
      setBrandError(err.message || 'Error executing set_brand');
    } finally {
      setBrandSaving(false);
    }
  };

  // View Brand Guidelines
  const handleViewGuidelines = async (brandName) => {
    setIsGuidelinesOpen(true);
    setGuidelinesLoading(true);
    setGuidelinesData(null);
    try {
      const res = await window.dori?.call('get_brand', { name: brandName });
      setGuidelinesData(res);
    } catch (err) {
      console.error('Failed to get brand context:', err);
      setGuidelinesData({ error: err.message });
    } finally {
      setGuidelinesLoading(false);
    }
  };

  const handleCopyGuidelinesContext = () => {
    if (!guidelinesData?.context) return;
    navigator.clipboard.writeText(guidelinesData.context);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Trigger Person Research (Deep or Web Only)
  const handleRunResearch = async (mode = 'full') => {
    if (!researchForm.name.trim()) return;
    setResearchLoading(true);
    setResearchError(null);
    setResearchResult(null);

    const { name, company, context, project } = researchForm;

    try {
      if (mode === 'full') {
        setResearchStage('Cross-referencing vault relationships, colleagues, and web background…');
        const res = await window.dori?.call('research_and_recommend', {
          name: name.trim(),
          ...(company ? { company: company.trim() } : {}),
          ...(context ? { context: context.trim() } : {}),
          ...(project ? { project: project.trim() } : {}),
        });
        setResearchResult({ mode: 'full', data: res });
      } else {
        setResearchStage('Querying Tavily for public web background…');
        const res = await window.dori?.call('research_person', {
          name: name.trim(),
          ...(company ? { company: company.trim() } : {}),
          ...(context ? { context: context.trim() } : {}),
        });
        setResearchResult({ mode: 'web', data: res });
      }
    } catch (err) {
      console.error('Research query failed:', err);
      setResearchError(err.message || 'Research request failed. Make sure TAVILY_API_KEY is configured if searching web.');
    } finally {
      setResearchLoading(false);
      setResearchStage('');
    }
  };

  // Quick prefill research from an org
  const handleResearchFromOrg = (org) => {
    const firstPerson = Array.isArray(org.people) && org.people.length > 0 ? org.people[0] : '';
    setResearchForm({
      name: firstPerson ? firstPerson.replace(/-/g, ' ') : '',
      company: org.name || '',
      context: org.evidence || '',
      project: '',
    });
    setActiveTab('research');
  };

  // Copy Briefing Markdown
  const handleCopyBriefing = () => {
    if (!researchResult) return;
    let markdown = '';
    const { mode, data } = researchResult;
    if (mode === 'full') {
      markdown += `# ${data.name}${data.company ? ' — ' + data.company : ''}\n\n`;
      if (data.org) {
        markdown += `**Existing Relationship:** ${data.org.role} at ${data.org.name}\n\n`;
      }
      if (data.colleagues && data.colleagues.length > 0) {
        markdown += '## Known Vault Colleagues\n';
        data.colleagues.forEach((c) => {
          markdown += `- ${c.name}${c.role ? ' (' + c.role + ')' : ''}\n`;
        });
        markdown += '\n';
      }
      if (data.vaultDocs && data.vaultDocs.length > 0) {
        markdown += '## Related Vault Docs\n';
        data.vaultDocs.forEach((d) => {
          markdown += `- ${d.title || d.rel_path}${d.date ? ' (' + d.date + ')' : ''}\n`;
        });
        markdown += '\n';
      }
      if (data.research?.results?.length > 0) {
        markdown += '## Web Research Hits\n';
        data.research.results.forEach((r) => {
          markdown += `- [${r.title}](${r.url})\n  ${r.content || ''}\n`;
        });
      }
    } else {
      markdown += `# Web Research: ${data.name}\n\n`;
      if (data.results?.length > 0) {
        data.results.forEach((r) => {
          markdown += `- [${r.title}](${r.url})\n  ${r.content || ''}\n`;
        });
      }
    }
    navigator.clipboard.writeText(markdown);
    setCopiedBriefing(true);
    setTimeout(() => setCopiedBriefing(false), 2000);
  };

  // Execute Entity Merge
  const handleExecuteMerge = async () => {
    if (!mergeForm.sourceSlug.trim() || !mergeForm.targetSlug.trim()) return;
    if (mergeForm.sourceSlug.trim() === mergeForm.targetSlug.trim()) {
      setMergeError('Source and Target entity slugs must be different.');
      return;
    }

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
      console.error('Merge execution failed:', err);
      setMergeError(err.message || 'Failed to merge entities.');
      setIsConfirmMergeOpen(false);
    } finally {
      setMergeLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
      <div className="page-frame max-w-5xl space-y-6">
        {/* Main Header */}
        <RouteHeader
          title="Entities & Directory"
          description="Manage organizations with affiliation evidence, brand design systems, and person research."
          meta={
            (totalOrgs > 0 || totalBrands > 0) ? (
              <div className="flex items-center gap-1.5">
                <Badge variant="muted" size="compact" className="text-xs font-semibold">
                  {totalOrgs} {totalOrgs === 1 ? 'organization' : 'organizations'}
                </Badge>
                <Badge variant="muted" size="compact" className="text-xs font-semibold">
                  {totalBrands} {totalBrands === 1 ? 'brand' : 'brands'}
                </Badge>
              </div>
            ) : null
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCredentialsOpen(true)}
                className="gap-1.5 text-xs font-medium"
              >
                <Key size={13} className="text-primary" />
                <span>Credentials Vault</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={loading}
                className="gap-1.5 text-xs"
              >
                <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
                <span>Refresh</span>
              </Button>
              {activeTab === 'orgs' && (
                <Button
                  size="sm"
                  onClick={() => setIsAddOrgOpen(true)}
                  className="gap-1.5 text-xs font-medium shadow-xs"
                >
                  <Plus size={13} />
                  <span>Add Organization</span>
                </Button>
              )}
              {activeTab === 'brands' && (
                <Button
                  size="sm"
                  onClick={() => handleOpenEditBrand(null)}
                  className="gap-1.5 text-xs font-medium shadow-xs"
                >
                  <Plus size={13} />
                  <span>New Brand</span>
                </Button>
              )}
            </div>
          }
        />

        {/* Tab Navigation Navigation Bar */}
        <div className="flex items-center gap-2 border-b border-border-soft pb-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <FilterChip
              key={id}
              selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className="gap-1.5 text-xs font-medium"
            >
              <Icon size={14} />
              <span>{label}</span>
              {id === 'orgs' && totalOrgs > 0 && (
                <span className="ml-1 text-[11px] opacity-75">({totalOrgs})</span>
              )}
              {id === 'brands' && totalBrands > 0 && (
                <span className="ml-1 text-[11px] opacity-75">({totalBrands})</span>
              )}
            </FilterChip>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: ORGANIZATIONS                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'orgs' && (
          <div className="space-y-6 anim-fade">
            {/* Search & Role Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                {ORG_ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setOrgRoleFilter(r.id)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors border',
                      orgRoleFilter === r.id
                        ? 'bg-foreground text-background border-transparent font-semibold shadow-xs'
                        : 'bg-card text-muted-foreground border-border-soft hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="relative max-w-xs flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={orgQuery}
                  onChange={(e) => setOrgQuery(e.target.value)}
                  placeholder="Search organizations, people, evidence…"
                  className="h-8 pl-8 text-xs bg-card border-border-soft rounded-control"
                />
              </div>
            </div>

            {/* Skeletons Loading */}
            {loading && !orgs && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-stagger">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="universal-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-12 w-full rounded-md" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredOrgs.length === 0 && (
              <EmptyState
                icon={Building2}
                title={orgQuery ? 'No matching organizations' : 'No organizations recorded yet'}
                description={
                  orgQuery
                    ? 'Try clearing the search query or selecting a different role filter.'
                    : 'Organizations require structured affiliation evidence (e.g. "Anita, CFO at Meridian") to prevent stray company mentions from cluttering your vault.'
                }
                action={{
                  label: 'Add Organization',
                  onClick: () => setIsAddOrgOpen(true),
                }}
              />
            )}

            {/* Organizations Grid */}
            {!loading && filteredOrgs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-stagger">
                {filteredOrgs.map((org) => {
                  const roleConfig = ORG_ROLES.find((r) => r.id === (org.role || 'none')) || ORG_ROLES[5];
                  return (
                    <div
                      key={org.slug || org.name}
                      className="universal-card p-5 flex flex-col justify-between gap-4 border border-border-soft hover:border-border transition-all shadow-xs"
                    >
                      <div className="space-y-3">
                        {/* Header: Name + Role Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border-soft text-foreground">
                              <Building2 size={16} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-display text-base font-semibold text-foreground truncate">
                                {org.name}
                              </h3>
                              <p className="text-[11px] font-mono text-muted-foreground truncate">
                                {org.slug}
                              </p>
                            </div>
                          </div>

                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border shrink-0',
                              roleConfig.colorClass
                            )}
                          >
                            {org.role || 'none'}
                          </span>
                        </div>

                        {/* Linked People Tags */}
                        {Array.isArray(org.people) && org.people.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider">
                              Linked People
                            </span>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {org.people.map((person) => (
                                <button
                                  key={person}
                                  type="button"
                                  onClick={() => {
                                    setResearchForm((f) => ({
                                      ...f,
                                      name: person.replace(/-/g, ' '),
                                      company: org.name,
                                    }));
                                    setActiveTab('research');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-field)] border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted transition-colors"
                                  title="Click to research this person"
                                >
                                  <Users size={11} className="text-muted-foreground" />
                                  <span>{person}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Affiliation Evidence Statement */}
                        <div className="rounded-lg border border-border-soft bg-[var(--surface-field)] p-3 text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground-secondary">
                            <ShieldCheck size={13} className="text-emerald-500" />
                            <span>Affiliation Evidence Bar</span>
                          </div>
                          {org.evidence ? (
                            <p className="text-muted-foreground italic text-xs leading-relaxed border-l-2 border-emerald-500/40 pl-2.5 my-1">
                              "{org.evidence}"
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-[11px] italic">
                              Structured manual record (no raw prose snippet stored).
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between border-t border-border-soft pt-3 text-xs">
                        <button
                          type="button"
                          onClick={() => handleResearchFromOrg(org)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                        >
                          <Search size={12} />
                          <span>Research Org &amp; People</span>
                        </button>

                        {onSelectDocument && (
                          <button
                            type="button"
                            onClick={() => onSelectDocument(`entities/organizations/${org.slug}.md`)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <FileText size={12} />
                            <span>View Markdown</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: BRANDS                                                             */}
        {/* ========================================================================= */}
        {activeTab === 'brands' && (
          <div className="space-y-6 anim-fade">
            {/* Search Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Brand design systems with primary/accent color swatches, typography tokens, and prompt context.
              </p>
              <div className="relative max-w-xs flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                  placeholder="Search brands, companies, owners…"
                  className="h-8 pl-8 text-xs bg-card border-border-soft rounded-control"
                />
              </div>
            </div>

            {/* Skeletons Loading */}
            {loading && !brands && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-stagger">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="universal-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-8 w-full rounded-md" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredBrands.length === 0 && (
              <EmptyState
                icon={Sparkles}
                title={brandQuery ? 'No matching brands' : 'No brands created yet'}
                description={
                  brandQuery
                    ? 'Try clearing the search filter.'
                    : 'Create brand themes with colors, typography, and voice guidelines to power branded generation and slide rendering.'
                }
                action={{
                  label: 'Create Brand',
                  onClick: () => handleOpenEditBrand(null),
                }}
              />
            )}

            {/* Brands Grid */}
            {!loading && filteredBrands.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-stagger">
                {filteredBrands.map((brand) => (
                  <div
                    key={brand.slug || brand.name}
                    className="universal-card p-5 flex flex-col justify-between gap-4 border border-border-soft hover:border-border transition-all shadow-xs"
                  >
                    <div className="space-y-3.5">
                      {/* Brand Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {brand.logo ? (
                            <img
                              src={brand.logo}
                              alt={brand.name}
                              className="h-9 w-9 shrink-0 rounded-lg object-contain border border-border bg-white p-0.5"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-soft text-white font-display font-bold text-sm shadow-xs"
                              style={{ backgroundColor: brand.primary || 'var(--primary)' }}
                            >
                              {brand.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-display text-base font-semibold text-foreground truncate">
                              {brand.name}
                            </h3>
                            {brand.company && (
                              <p className="text-xs text-muted-foreground truncate">
                                {brand.company}
                              </p>
                            )}
                          </div>
                        </div>

                        {brand.owner && (
                          <Badge variant="muted" size="compact" className="text-[11px]">
                            Owner: {brand.owner}
                          </Badge>
                        )}
                      </div>

                      {/* Color Palette Swatches */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider flex items-center gap-1">
                          <Palette size={11} /> Color Palette
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Primary Swatch */}
                          <div className="flex items-center gap-2 rounded-md border border-border-soft bg-[var(--surface-field)] p-2">
                            <span
                              className="h-5 w-5 rounded-full border border-black/10 shadow-xs shrink-0"
                              style={{ backgroundColor: brand.primary || '#0ea5e9' }}
                            />
                            <div className="min-w-0 leading-none">
                              <span className="text-[10px] text-muted-foreground uppercase block">Primary</span>
                              <span className="text-xs font-mono font-medium text-foreground truncate">
                                {brand.primary || '—'}
                              </span>
                            </div>
                          </div>

                          {/* Accent Swatch */}
                          <div className="flex items-center gap-2 rounded-md border border-border-soft bg-[var(--surface-field)] p-2">
                            <span
                              className="h-5 w-5 rounded-full border border-black/10 shadow-xs shrink-0"
                              style={{ backgroundColor: brand.accent || '#f59e0b' }}
                            />
                            <div className="min-w-0 leading-none">
                              <span className="text-[10px] text-muted-foreground uppercase block">Accent</span>
                              <span className="text-xs font-mono font-medium text-foreground truncate">
                                {brand.accent || '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Typography Specification */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider flex items-center gap-1">
                          <Type size={11} /> Typography
                        </span>
                        <div className="rounded-md border border-border-soft bg-[var(--surface-field)] p-2.5 text-xs flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase block">Display Font</span>
                            <span className="font-medium text-foreground">
                              {brand.fontDisplay || 'Figtree'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground uppercase block">Body Font</span>
                            <span className="font-medium text-foreground">
                              {brand.fontBody || 'Figtree'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Brand Card Footer Actions */}
                    <div className="flex items-center justify-between border-t border-border-soft pt-3 text-xs">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewGuidelines(brand.name)}
                        className="gap-1.5 text-xs"
                      >
                        <Eye size={12} />
                        <span>Guidelines &amp; Voice</span>
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditBrand(brand)}
                          className="gap-1 text-xs"
                        >
                          <Edit3 size={12} />
                          <span>Edit</span>
                        </Button>
                        {onSelectDocument && (
                          <button
                            type="button"
                            onClick={() => onSelectDocument(`entities/brands/${brand.slug}.md`)}
                            className="text-muted-foreground hover:text-foreground text-xs p-1"
                            title="View markdown file"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PEOPLE & RESEARCH                                                  */}
        {/* ========================================================================= */}
        {activeTab === 'research' && (
          <div className="space-y-6 anim-fade">
            {/* Research Input Console */}
            <div className="universal-card p-6 border border-border bg-card space-y-4 shadow-sm">
              <div>
                <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <Search size={16} className="text-primary" />
                  <span>Person Research &amp; Meeting Briefing Console</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Search the web via Tavily and cross-reference with existing vault colleagues, organization affiliations, and related documents.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Person Full Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={researchForm.name}
                    onChange={(e) => setResearchForm({ ...researchForm, name: e.target.value })}
                    placeholder="e.g. Priya Menon or Anita Sharma"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Company / Organization (Optional)
                  </label>
                  <Input
                    value={researchForm.company}
                    onChange={(e) => setResearchForm({ ...researchForm, company: e.target.value })}
                    placeholder="e.g. Acme Corp or Meridian"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium text-foreground">
                    Meeting Context / Topic (Optional)
                  </label>
                  <Input
                    value={researchForm.context}
                    onChange={(e) => setResearchForm({ ...researchForm, context: e.target.value })}
                    placeholder="e.g. Series A pitch discussion, technical architecture review"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-soft">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info size={13} />
                  <span>Requires Tavily API key for live web search queries</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunResearch('web')}
                    disabled={researchLoading || !researchForm.name.trim()}
                    className="gap-1.5 text-xs"
                  >
                    <Globe size={13} />
                    <span>Web Search Only</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleRunResearch('full')}
                    disabled={researchLoading || !researchForm.name.trim()}
                    className="gap-1.5 text-xs font-medium shadow-xs"
                  >
                    <Sparkles size={13} />
                    <span>Generate Full Briefing</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Loading Indicator */}
            {researchLoading && (
              <div className="universal-card p-8 text-center space-y-3 anim-rise border border-primary/20 bg-primary/5">
                <RefreshCw size={24} className="animate-spin mx-auto text-primary" />
                <h4 className="font-display text-sm font-semibold text-foreground">
                  Synthesizing Briefing…
                </h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {researchStage || 'Cross-referencing web background with vault knowledge graph…'}
                </p>
              </div>
            )}

            {/* Error Message */}
            {researchError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Research Query Error</p>
                  <p className="mt-0.5 text-destructive/90">{researchError}</p>
                </div>
              </div>
            )}

            {/* Research Results Briefing */}
            {!researchLoading && researchResult && (
              <div className="space-y-4 anim-rise">
                {/* Header Card */}
                <div className="universal-card p-5 border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-foreground">
                        {researchResult.data?.name}
                      </h3>
                      {researchResult.data?.company && (
                        <Badge variant="outline" size="compact" className="text-xs">
                          {researchResult.data.company}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Synthesized briefing generated {new Date().toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyBriefing}
                      className="gap-1.5 text-xs"
                    >
                      {copiedBriefing ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      <span>{copiedBriefing ? 'Copied' : 'Copy Briefing'}</span>
                    </Button>
                  </div>
                </div>

                {/* Relationship Status Notice */}
                {researchResult.mode === 'full' && (
                  <>
                    {researchResult.data?.org ? (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-foreground flex items-center gap-3">
                        <Building2 size={18} className="text-emerald-500 shrink-0" />
                        <div>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                            Existing Vault Relationship
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            You already have a <strong>{researchResult.data.org.role}</strong> relationship on file with <strong>{researchResult.data.org.name}</strong>.
                          </p>
                        </div>
                      </div>
                    ) : (
                      researchResult.data?.company && (
                        <div className="rounded-lg border border-border-soft bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-center gap-2.5">
                          <Info size={15} className="shrink-0" />
                          <span>
                            No prior organization record on file for <strong>{researchResult.data.company}</strong> (cold entity).
                          </span>
                        </div>
                      )
                    )}

                    {/* Vault Colleagues & Related Docs Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Colleagues */}
                      <div className="universal-card p-5 space-y-3 border border-border-soft">
                        <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Users size={13} />
                          <span>Known Vault Colleagues ({researchResult.data?.colleagues?.length || 0})</span>
                        </h4>

                        {(!researchResult.data?.colleagues || researchResult.data.colleagues.length === 0) ? (
                          <p className="text-xs text-muted-foreground italic py-2">
                            No other people from this company currently found in your vault.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {researchResult.data.colleagues.map((colleague, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-md border border-border-soft bg-[var(--surface-field)] px-3 py-2 text-xs"
                              >
                                <span className="font-medium text-foreground">{colleague.name}</span>
                                {colleague.role && (
                                  <Badge variant="muted" size="compact" className="text-[10px]">
                                    {colleague.role}
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Related Vault Docs */}
                      <div className="universal-card p-5 space-y-3 border border-border-soft">
                        <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <FileText size={13} />
                          <span>Related Vault Documents ({researchResult.data?.vaultDocs?.length || 0})</span>
                        </h4>

                        {(!researchResult.data?.vaultDocs || researchResult.data.vaultDocs.length === 0) ? (
                          <p className="text-xs text-muted-foreground italic py-2">
                            No prior documents found matching this company or project query.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {researchResult.data.vaultDocs.map((doc, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onSelectDocument?.(doc.rel_path)}
                                className="w-full text-left flex items-center justify-between rounded-md border border-border-soft bg-[var(--surface-field)] px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <p className="font-medium text-foreground truncate">{doc.title || doc.rel_path}</p>
                                  <p className="text-[10px] font-mono text-muted-foreground truncate">{doc.rel_path}</p>
                                </div>
                                <ExternalLink size={12} className="text-muted-foreground shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Web Research Results Section */}
                <div className="universal-card p-5 space-y-4 border border-border-soft">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Globe size={13} />
                      <span>Web Research Hits</span>
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-mono">Tavily Search API</span>
                  </div>

                  {(() => {
                    const hits = researchResult.mode === 'full'
                      ? researchResult.data?.research?.results || []
                      : researchResult.data?.results || [];

                    if (hits.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground italic py-4 text-center">
                          No web search results returned for this query.
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {hits.map((hit, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-border-soft bg-[var(--surface-field)] p-3.5 space-y-1.5 text-xs hover:border-border transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <a
                                href={hit.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary hover:underline flex items-center gap-1 text-sm"
                              >
                                <span>{hit.title || hit.url}</span>
                                <ExternalLink size={12} className="shrink-0" />
                              </a>
                            </div>
                            <p className="text-[11px] font-mono text-muted-foreground truncate">
                              {hit.url}
                            </p>
                            {hit.content && (
                              <p className="text-xs text-muted-foreground leading-relaxed pt-1 line-clamp-3">
                                {hit.content}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground border border-border-soft flex items-center gap-2">
                    <ShieldAlert size={13} className="text-amber-500 shrink-0" />
                    <span>
                      Unverified web search results — confirm identity before treating as ground truth.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ENTITY MERGING                                                     */}
        {/* ========================================================================= */}
        {activeTab === 'merge' && (
          <div className="space-y-6 anim-fade max-w-3xl">
            {/* Merge Overview Card */}
            <div className="universal-card p-6 border border-border bg-card space-y-4 shadow-sm">
              <div>
                <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <GitMerge size={17} className="text-primary" />
                  <span>Non-Destructive Entity Deduplication &amp; Merge</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Unify duplicate organizations or person profiles. The canonical survivor absorbs all aliases and people linkages, references across your vault are rewritten, and the source file is safely archived with redirection.
                </p>
              </div>

              {/* Entity Type Selection */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium text-foreground">Entity Type to Merge</label>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  {[
                    { id: 'org', label: 'Organization Entity', icon: Building2, desc: 'Merges into entities/organizations/' },
                    { id: 'person', label: 'Person Entity', icon: Users, desc: 'Merges into entities/people/' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setMergeForm({ ...mergeForm, type: t.id })}
                      className={cn(
                        'flex flex-col items-start gap-1 p-3.5 rounded-panel border text-left transition-all',
                        mergeForm.type === t.id
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-border-soft bg-[var(--surface-field)] hover:border-border'
                      )}
                    >
                      <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                        <t.icon size={14} className={cn(mergeForm.type === t.id ? 'text-primary' : 'text-muted-foreground')} />
                        <span>{t.label}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Source & Target Slugs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Source Entity (Losing side) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-destructive flex items-center gap-1">
                    <span>Source Entity Slug (To Archive)</span>
                  </label>
                  <Input
                    value={mergeForm.sourceSlug}
                    onChange={(e) => setMergeForm({ ...mergeForm, sourceSlug: e.target.value })}
                    placeholder="e.g. meridian-old or priya-m"
                    className="text-xs font-mono bg-[var(--surface-field)] border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Moved to <code>entities/{mergeForm.type === 'person' ? 'people' : 'organizations'}/merged/</code>.
                  </p>
                </div>

                {/* Target Entity (Surviving side) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <span>Target Entity Slug (Canonical Survivor)</span>
                  </label>
                  <Input
                    value={mergeForm.targetSlug}
                    onChange={(e) => setMergeForm({ ...mergeForm, targetSlug: e.target.value })}
                    placeholder="e.g. meridian or priya-menon"
                    className="text-xs font-mono bg-[var(--surface-field)] border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Receives source aliases and retains primary entity status.
                  </p>
                </div>
              </div>

              {/* Impact Analysis Preview Box */}
              {mergeForm.sourceSlug && mergeForm.targetSlug && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs space-y-2 anim-fade">
                  <p className="font-semibold text-primary flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    <span>Merge Impact &amp; Vault Verification</span>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px] leading-relaxed">
                    <li>
                      <strong>Target Survivor ({mergeForm.targetSlug}):</strong> Will inherit source name and aliases into frontmatter.
                    </li>
                    {mergeForm.type === 'org' && (
                      <li>
                        <strong>People Union:</strong> All linked team members from both records will be unioned.
                      </li>
                    )}
                    <li>
                      <strong>Vault Cross-References:</strong> All matching <code>people:</code> and <code>owner:</code> references in organizations and brands will be rewritten to <code>{mergeForm.targetSlug}</code>.
                    </li>
                    <li>
                      <strong>Non-Destructive Archival:</strong> Source file <code>{mergeForm.sourceSlug}.md</code> is moved to <code>merged/</code> with <code>redirectTo: {mergeForm.targetSlug}</code>.
                    </li>
                  </ul>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2 flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={() => setIsConfirmMergeOpen(true)}
                  disabled={!mergeForm.sourceSlug.trim() || !mergeForm.targetSlug.trim() || mergeLoading}
                  className="gap-1.5 text-xs font-semibold shadow-xs"
                >
                  <GitMerge size={13} />
                  <span>Preview &amp; Execute Merge</span>
                </Button>
              </div>
            </div>

            {/* Merge Error Notice */}
            {mergeError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center gap-2.5 anim-fade">
                <AlertCircle size={16} className="shrink-0" />
                <span>{mergeError}</span>
              </div>
            )}

            {/* Merge Success Result Card */}
            {mergeResult && (
              <div className="universal-card p-5 border border-emerald-500/30 bg-emerald-500/10 space-y-3 anim-rise">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 size={18} />
                  <span>Entity Merge Executed Successfully!</span>
                </div>

                <div className="space-y-1.5 text-xs text-foreground">
                  <p>
                    Merged <strong>{mergeResult.sourceSlug}</strong> into canonical entity <strong>{mergeResult.canonicalSlug}</strong>.
                  </p>
                  {mergeResult.aliasesAdded && mergeResult.aliasesAdded.length > 0 && (
                    <p className="text-muted-foreground text-[11px]">
                      Aliases recorded: <code>{mergeResult.aliasesAdded.join(', ')}</code>
                    </p>
                  )}
                  {mergeResult.referencesRewritten && mergeResult.referencesRewritten.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                        Rewritten Vault References ({mergeResult.referencesRewritten.length}):
                      </span>
                      <ul className="list-disc list-inside text-[11px] text-muted-foreground mt-0.5">
                        {mergeResult.referencesRewritten.map((ref, i) => (
                          <li key={i}>{ref.file} ({ref.field})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-muted-foreground text-[11px] pt-1">
                    Archived source location: <code>{mergeResult.archivedSourcePath}</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD ORGANIZATION                                                   */}
      {/* ========================================================================= */}
      {isAddOrgOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] anim-rise p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsAddOrgOpen(false); }}
        >
          <div className="flex h-auto max-h-[90vh] w-[90vw] max-w-lg flex-col overflow-hidden rounded-control border border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-6 py-4 bg-[var(--surface-canvas)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 size={16} />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">Add Organization</h3>
                  <p className="text-xs text-muted-foreground">Create organization entity with affiliation evidence verification</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddOrgOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddOrgSubmit} className="overflow-y-auto p-6 space-y-4 text-xs">
              {addOrgError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{addOrgError}</span>
                </div>
              )}

              {addOrgSuccess && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-600 flex items-center gap-2">
                  <Check size={15} className="shrink-0" />
                  <span>{addOrgSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-medium text-foreground">
                  Organization Name <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  value={newOrgForm.orgName}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, orgName: e.target.value })}
                  placeholder="e.g. Meridian, Acme Corp, Anthropic"
                  className="text-xs bg-[var(--surface-field)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Organization Role</label>
                <select
                  value={newOrgForm.role}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, role: e.target.value })}
                  className="w-full rounded-lg border border-border bg-[var(--surface-field)] px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="client">Client</option>
                  <option value="vendor">Vendor</option>
                  <option value="partner">Partner</option>
                  <option value="employer">Employer</option>
                  <option value="none">None / Unspecified</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Linked Person Name</label>
                  <Input
                    value={newOrgForm.personName}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, personName: e.target.value })}
                    placeholder="e.g. Anita Sharma"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Person Slug</label>
                  <Input
                    value={newOrgForm.personSlug}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, personSlug: e.target.value })}
                    placeholder="e.g. anita-sharma"
                    className="text-xs bg-[var(--surface-field)] font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Affiliation Evidence Snippet</label>
                <textarea
                  rows={2}
                  value={newOrgForm.evidenceText}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, evidenceText: e.target.value })}
                  placeholder="e.g. 'Anita, CFO at Meridian' or 'Anita works as Lead Architect for Meridian'"
                  className="w-full resize-none rounded-lg border border-border bg-[var(--surface-field)] p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="rounded-lg border border-border-soft bg-muted/40 p-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  id="requireEvidence"
                  checked={newOrgForm.requireEvidence}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, requireEvidence: e.target.checked })}
                  className="mt-0.5 rounded border-border text-primary"
                />
                <label htmlFor="requireEvidence" className="text-[11px] text-muted-foreground leading-snug cursor-pointer">
                  <strong>Strict Affiliation Evidence Gate:</strong> Require pattern matching on role/title assertion (disabling allows direct structured creation).
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-soft">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOrgOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={addOrgLoading || !newOrgForm.orgName.trim()}>
                  {addOrgLoading ? 'Saving…' : 'Ensure Organization'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT BRAND                                                */}
      {/* ========================================================================= */}
      {isBrandModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] anim-rise p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsBrandModalOpen(false); }}
        >
          <div className="flex h-auto max-h-[90vh] w-[90vw] max-w-lg flex-col overflow-hidden rounded-control border border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-6 py-4 bg-[var(--surface-canvas)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {editingBrand ? `Edit ${editingBrand.name}` : 'Create Brand Theme'}
                  </h3>
                  <p className="text-xs text-muted-foreground">Theme tokens, typography, and logo configuration</p>
                </div>
              </div>
              <button
                onClick={() => setIsBrandModalOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBrandSubmit} className="overflow-y-auto p-6 space-y-4 text-xs">
              {brandError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{brandError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Brand Name <span className="text-destructive">*</span></label>
                  <Input
                    required
                    value={brandForm.name}
                    onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                    placeholder="e.g. Dori"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Legal Company</label>
                  <Input
                    value={brandForm.company}
                    onChange={(e) => setBrandForm({ ...brandForm, company: e.target.value })}
                    placeholder="e.g. Dori Systems Inc."
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Brand Owner / Slug</label>
                <Input
                  value={brandForm.owner}
                  onChange={(e) => setBrandForm({ ...brandForm, owner: e.target.value })}
                  placeholder="e.g. alex-mercer"
                  className="text-xs bg-[var(--surface-field)] font-mono"
                />
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground flex items-center gap-1.5">
                    <span>Primary Color</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandForm.primary}
                      onChange={(e) => setBrandForm({ ...brandForm, primary: e.target.value })}
                      className="h-8 w-8 rounded cursor-pointer border border-border p-0.5 bg-card"
                    />
                    <Input
                      value={brandForm.primary}
                      onChange={(e) => setBrandForm({ ...brandForm, primary: e.target.value })}
                      placeholder="#0ea5e9"
                      className="text-xs font-mono bg-[var(--surface-field)] flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-medium text-foreground flex items-center gap-1.5">
                    <span>Accent Color</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandForm.accent}
                      onChange={(e) => setBrandForm({ ...brandForm, accent: e.target.value })}
                      className="h-8 w-8 rounded cursor-pointer border border-border p-0.5 bg-card"
                    />
                    <Input
                      value={brandForm.accent}
                      onChange={(e) => setBrandForm({ ...brandForm, accent: e.target.value })}
                      placeholder="#f59e0b"
                      className="text-xs font-mono bg-[var(--surface-field)] flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Typography */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Display Font</label>
                  <Input
                    value={brandForm.fontDisplay}
                    onChange={(e) => setBrandForm({ ...brandForm, fontDisplay: e.target.value })}
                    placeholder="Figtree, Inter, Syne"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Body Font</label>
                  <Input
                    value={brandForm.fontBody}
                    onChange={(e) => setBrandForm({ ...brandForm, fontBody: e.target.value })}
                    placeholder="Figtree, Inter, Geist"
                    className="text-xs bg-[var(--surface-field)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-foreground">Logo Image URL / Path</label>
                <Input
                  value={brandForm.logo}
                  onChange={(e) => setBrandForm({ ...brandForm, logo: e.target.value })}
                  placeholder="https://… or /assets/logo.png"
                  className="text-xs bg-[var(--surface-field)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-soft">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsBrandModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={brandSaving || !brandForm.name.trim()}>
                  {brandSaving ? 'Saving…' : 'Save Brand'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER / MODAL: BRAND GUIDELINES                                          */}
      {/* ========================================================================= */}
      {isGuidelinesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] anim-rise p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsGuidelinesOpen(false); }}
        >
          <div className="flex h-[80vh] w-[90vw] max-w-2xl flex-col overflow-hidden rounded-control border border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-6 py-4 bg-[var(--surface-canvas)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Eye size={16} />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    Brand Guidelines & Voice Context
                  </h3>
                  <p className="text-xs text-muted-foreground">Prompt-ready brand voice block for AI tools</p>
                </div>
              </div>
              <button
                onClick={() => setIsGuidelinesOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {guidelinesLoading && (
                <div className="space-y-3 py-6">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              )}

              {!guidelinesLoading && guidelinesData && (
                <div className="space-y-4">
                  {guidelinesData.brand && (
                    <div className="rounded-lg border border-border-soft bg-[var(--surface-field)] p-4 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-display font-semibold text-foreground text-sm">
                          {guidelinesData.brand.name}
                        </h4>
                        {guidelinesData.brand.company && (
                          <p className="text-xs text-muted-foreground">
                            {guidelinesData.brand.company}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {guidelinesData.brand.primary && (
                          <span
                            className="h-5 w-5 rounded-full border border-black/10 shadow-xs"
                            style={{ backgroundColor: guidelinesData.brand.primary }}
                            title="Primary Color"
                          />
                        )}
                        {guidelinesData.brand.accent && (
                          <span
                            className="h-5 w-5 rounded-full border border-black/10 shadow-xs"
                            style={{ backgroundColor: guidelinesData.brand.accent }}
                            title="Accent Color"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Formatted Prompt Context Block
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleCopyGuidelinesContext}
                        className="gap-1 text-xs"
                      >
                        {copiedPrompt ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedPrompt ? 'Copied' : 'Copy Prompt Block'}</span>
                      </Button>
                    </div>

                    <pre className="rounded-lg border border-border-soft bg-[var(--surface-canvas)] p-4 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {guidelinesData.context || guidelinesData.error || 'No guidelines context recorded.'}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border-soft px-6 py-3 bg-[var(--surface-canvas)] flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsGuidelinesOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG: CONFIRM ENTITY MERGE                                              */}
      {/* ========================================================================= */}
      {isConfirmMergeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] anim-rise p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsConfirmMergeOpen(false); }}
        >
          <div className="flex h-auto max-w-md w-full flex-col overflow-hidden rounded-control border border-border bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <ShieldAlert size={24} className="shrink-0" />
              <h3 className="font-display text-base font-bold text-foreground">
                Confirm Entity Merge
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to merge <strong>{mergeForm.sourceSlug}</strong> into canonical entity <strong>{mergeForm.targetSlug}</strong>?
            </p>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300 leading-snug space-y-1">
              <p className="font-semibold">Non-destructive operation:</p>
              <p>The source file will be moved into <code>merged/</code> with redirection and vault cross-references will be updated.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsConfirmMergeOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteMerge}
                disabled={mergeLoading}
                className="gap-1 text-xs font-semibold"
              >
                {mergeLoading ? 'Executing Merge…' : 'Confirm & Merge'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREDENTIALS VAULT                                                  */}
      {/* ========================================================================= */}
      <CredentialsModal
        isOpen={isCredentialsOpen}
        onClose={() => setIsCredentialsOpen(false)}
      />
    </div>
  );
}
