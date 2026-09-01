import { useCallback, useEffect, useState } from 'react';
import {
  X,
  Key,
  Lock,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  AlertCircle,
  ChevronRight,
  EyeOff,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { Input } from './ui/input.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { cn } from '../lib/utils.js';

export function CredentialsModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [serviceDetails, setServiceDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeUrl, setIntakeUrl] = useState(null);
  const [intakeError, setIntakeError] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const loadCredentials = useCallback((searchTerm = '') => {
    setLoading(true);
    setError(null);
    const term = searchTerm.trim();
    const action = term ? 'find_credentials' : 'list_credentials';
    const payload = term ? { query: term } : {};

    window.dori?.call(action, payload)
      .then((items) => {
        setCredentials(items || []);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load credentials:', err);
        setCredentials([]);
        setError(err.message || 'Could not load credentials.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedService(null);
      setServiceDetails(null);
      setIntakeUrl(null);
      setIntakeError(null);
      loadCredentials('');
    }
  }, [isOpen, loadCredentials]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    loadCredentials(val);
  };

  const handleSelectService = (serviceName) => {
    if (selectedService === serviceName) {
      setSelectedService(null);
      setServiceDetails(null);
      return;
    }
    setSelectedService(serviceName);
    setLoadingDetails(true);
    window.dori?.call('list_credentials', { service: serviceName })
      .then((rows) => {
        setServiceDetails(rows || []);
      })
      .catch((err) => {
        console.error('Failed to load service details:', err);
        setServiceDetails([]);
      })
      .finally(() => setLoadingDetails(false));
  };

  const handleStartIntakeServer = async () => {
    setIntakeLoading(true);
    setIntakeError(null);
    try {
      const res = await window.dori?.call('start_credential_server', {});
      if (res?.url) {
        setIntakeUrl(res.url);
        window.open(res.url, '_blank');
      } else {
        setIntakeError('Intake server did not return a valid endpoint URL.');
      }
    } catch (err) {
      console.error('Failed to start credential server:', err);
      setIntakeError(err.message || 'Failed to start intake server.');
    } finally {
      setIntakeLoading(false);
    }
  };

  const handleCopyIntakeUrl = () => {
    if (!intakeUrl) return;
    navigator.clipboard.writeText(intakeUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] anim-rise p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[85vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-control border border-border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-6 py-4 bg-[var(--surface-canvas)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Key size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-foreground">Credentials Vault</h2>
                <Badge variant="muted" size="compact" className="text-[11px] gap-1 font-mono">
                  <Lock size={10} /> AES-256-GCM
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Encrypted service keys and tokens stored securely with macOS Keychain integration.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Header / Intake Bar */}
        <div className="border-b border-border-soft bg-card px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={handleSearchChange}
              placeholder="Search services, labels, aliases…"
              className="h-8 pl-8 text-xs bg-[var(--surface-field)] border-border rounded-control"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadCredentials(query)}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={handleStartIntakeServer}
              disabled={intakeLoading}
              className="gap-1.5 text-xs font-medium shadow-xs"
            >
              <Lock size={12} />
              <span>{intakeLoading ? 'Launching Intake…' : 'Add Credential Securely'}</span>
            </Button>
          </div>
        </div>

        {/* Ephemeral Intake Server Notice */}
        {intakeUrl && (
          <div className="mx-6 mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3 anim-fade">
            <div className="flex items-start gap-2.5 min-w-0">
              <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Ephemeral Token Intake Active
                </p>
                <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                  Intake server listening. Form opened in browser. Single-use token expires in 5 minutes.
                </p>
                <code className="inline-block mt-1 text-[11px] font-mono text-foreground-secondary break-all bg-background/50 px-2 py-0.5 rounded border border-border-soft">
                  {intakeUrl}
                </code>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <Button
                variant="outline"
                size="xs"
                onClick={handleCopyIntakeUrl}
                className="gap-1 text-xs"
              >
                {copiedUrl ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                <span>{copiedUrl ? 'Copied' : 'Copy Link'}</span>
              </Button>
              <Button
                size="xs"
                onClick={() => window.open(intakeUrl, '_blank')}
                className="gap-1 text-xs"
              >
                <ExternalLink size={12} />
                <span>Open Browser</span>
              </Button>
            </div>
          </div>
        )}

        {intakeError && (
          <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{intakeError}</span>
          </div>
        )}

        {/* Credentials Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && !credentials && (
            <div className="space-y-3 anim-stagger">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="universal-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            </div>
          )}

          {!loading && credentials && credentials.length === 0 && (
            <EmptyState
              icon={Key}
              title={query ? 'No matching credentials' : 'No credentials stored yet'}
              description={
                query
                  ? 'Try searching by a different service name, alias, or keyword.'
                  : 'Add API keys, webhook secrets, or service credentials securely via the browser intake form.'
              }
              action={{
                label: 'Add Credential Securely',
                onClick: handleStartIntakeServer,
              }}
            />
          )}

          {!loading && credentials && credentials.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span className="font-medium uppercase tracking-wider text-[11px]">
                  Configured Services ({credentials.length})
                </span>
                <span className="text-[11px]">Click service to view registered field schema</span>
              </div>

              <div className="space-y-2.5">
                {credentials.map((item) => {
                  const isExpanded = selectedService === item.service;
                  return (
                    <div
                      key={item.service}
                      className={cn(
                        'universal-card transition-all overflow-hidden border',
                        isExpanded
                          ? 'border-primary/50 shadow-sm bg-card'
                          : 'border-border-soft hover:border-border hover:bg-muted/20'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectService(item.service)}
                        className="w-full text-left p-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border-soft text-foreground font-mono text-xs font-semibold uppercase">
                            {item.service.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-mono text-sm font-semibold text-foreground tracking-tight">
                                {item.service}
                              </h3>
                              {item.label && (
                                <span className="text-xs text-muted-foreground font-normal">
                                  ({item.label})
                                </span>
                              )}
                            </div>
                            {item.aliases && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                Aliases: {item.aliases}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {item.fieldCount !== undefined && (
                            <Badge variant="muted" size="compact" className="text-[11px]">
                              {item.fieldCount} {item.fieldCount === 1 ? 'field' : 'fields'}
                            </Badge>
                          )}
                          <Badge variant="outline" size="compact" className="text-[11px] gap-1">
                            <ShieldCheck size={11} className="text-emerald-500" />
                            <span>Encrypted</span>
                          </Badge>
                          <ChevronRight
                            size={16}
                            className={cn(
                              'text-muted-foreground transition-transform duration-200',
                              isExpanded && 'rotate-90'
                            )}
                          />
                        </div>
                      </button>

                      {/* Expanded Field Details */}
                      {isExpanded && (
                        <div className="border-t border-border-soft bg-[var(--surface-canvas)] p-4 anim-fade space-y-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium">Registered Service Fields</span>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                              <EyeOff size={11} /> Cleartext secrets withheld from renderer
                            </span>
                          </div>

                          {loadingDetails && (
                            <div className="space-y-2 py-2">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                            </div>
                          )}

                          {!loadingDetails && serviceDetails && serviceDetails.length === 0 && (
                            <p className="text-xs text-muted-foreground italic py-2">
                              No field breakdown found for {item.service}.
                            </p>
                          )}

                          {!loadingDetails && serviceDetails && serviceDetails.length > 0 && (
                            <div className="rounded-control border border-border bg-card overflow-hidden text-xs">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border-soft bg-muted/40 text-muted-foreground text-[11px]">
                                    <th className="py-2 px-3 font-semibold">Field Key</th>
                                    <th className="py-2 px-3 font-semibold">Storage Type</th>
                                    <th className="py-2 px-3 font-semibold text-right">Last Updated</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {serviceDetails.map((f) => (
                                    <tr
                                      key={f.field}
                                      className="border-b border-border-soft last:border-b-0 hover:bg-muted/20"
                                    >
                                      <td className="py-2 px-3 font-mono font-medium text-foreground">
                                        {f.field}
                                      </td>
                                      <td className="py-2 px-3">
                                        {f.secret ? (
                                          <Badge variant="destructive" size="compact" className="text-[10px] gap-1">
                                            <Lock size={9} /> AES Encrypted Secret
                                          </Badge>
                                        ) : (
                                          <Badge variant="muted" size="compact" className="text-[10px]">
                                            Plaintext Metadata
                                          </Badge>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-right text-muted-foreground text-[11px]">
                                        {f.updatedAt ? new Date(f.updatedAt).toLocaleDateString() : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 border-t border-border-soft px-6 py-3 bg-[var(--surface-canvas)] flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Info size={13} />
            <span>Encrypted locally in <code>~/.dori/credentials.db</code> with AES-GCM-256</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
