// Matches dori-portal/app/inbox/page.tsx's real decision-card rendering
// (bordered rounded card, circular type icon, uppercase eyebrow + date,
// font-display title) rather than the flat divided-row list EntityItem/
// InboxItem use elsewhere — that pattern comes from a different, more
// generic surface (entity-list.tsx) and isn't what the real Inbox looks
// like. Trimmed to the two item types dori-mini's list-inbox.mjs actually
// produces (clarification, inbox_file) instead of the real app's ~9.
import { FileText, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils.js';

const ICONS = {
  clarification: HelpCircle,
  inbox_file: FileText
};

export function DecisionCard({ type, title, domain, createdAt, actions }) {
  const Icon = ICONS[type] || FileText;
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-sm transition-colors',
        'hover:border-[var(--brand-primary)]/30 sm:flex-row sm:items-center sm:gap-6'
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-micro font-bold uppercase tracking-wider text-muted-foreground">
            {type.replace('_', ' ')}
          </span>
          {createdAt && <span className="text-micro text-muted-foreground">{createdAt}</span>}
        </div>
        <h3 className="truncate font-display text-title font-medium text-foreground">{title}</h3>
        {domain && <p className="mt-1 text-sm text-muted-foreground">{domain}</p>}
      </div>

      {actions && (
        <div className="mt-4 flex w-full shrink-0 flex-wrap items-center gap-2 sm:mt-0 sm:w-auto">{actions}</div>
      )}
    </div>
  );
}
