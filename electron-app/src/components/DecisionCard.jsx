import { FileText, HelpCircle, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils.js';

const ICONS = {
  clarification: HelpCircle,
  inbox_file: FileText,
};

export function DecisionCard({ type, title, domain, createdAt, actions }) {
  const Icon = ICONS[type] || FileText;
  return (
    <div
      className={cn(
        'universal-card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:gap-5'
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-primary shadow-xs">
        <Icon className="h-5 w-5 text-[var(--brand-primary)]" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
            {type.replace('_', ' ')}
          </span>
          {createdAt && (
            <span className="text-micro text-muted-foreground">{createdAt}</span>
          )}
        </div>
        <h3 className="truncate font-display text-sm font-semibold text-foreground">
          {title}
        </h3>
        {domain && <p className="mt-0.5 text-xs text-muted-foreground">{domain}</p>}
      </div>

      {actions && (
        <div className="mt-3 flex w-full shrink-0 flex-wrap items-center gap-2 sm:mt-0 sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
