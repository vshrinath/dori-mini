// Lifted from dori-portal/components/ui/empty-state.tsx (types stripped,
// href/Link support dropped — this app has no router, only onClick actions).
import { Button } from './button.jsx';
import { cn } from '../../lib/utils.js';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-6 py-10' : 'px-8 py-20',
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--brand-accent-text)]',
            compact ? 'mb-3 h-10 w-10' : 'mb-4 h-12 w-12'
          )}
          aria-hidden
        >
          <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={1.75} />
        </div>
      )}
      <p className={cn('text-muted-foreground font-medium', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && (
        <p className={cn('text-muted-foreground/80 mt-1 max-w-sm leading-relaxed', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-3">
          {action && (
            <Button type="button" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button type="button" size="sm" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
