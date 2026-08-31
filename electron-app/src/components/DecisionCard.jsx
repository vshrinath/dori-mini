import { FileText, HelpCircle } from 'lucide-react';
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
        'universal-card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:gap-6'
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-primary shadow-xs">
        <Icon className="h-6 w-6 text-[var(--brand-primary)]" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {type.replace('_', ' ')}
          </span>
          {createdAt && (
            <span className="text-xs text-muted-foreground">{createdAt}</span>
          )}
        </div>
        <h3 className="truncate font-display text-base font-semibold text-foreground">
          {title}
        </h3>
        {domain && <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{domain}</p>}
      </div>

      {actions && (
        <div className="mt-3 flex w-full shrink-0 flex-wrap items-center gap-2.5 sm:mt-0 sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
