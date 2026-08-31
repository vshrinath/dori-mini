// Lifted from dori-portal/components/surfaces/entity-list.tsx (types
// stripped — Dori Go's renderer is plain JS, not TS). Domain-neutral row
// component per the original's own docstring: reused here for inbox now,
// task rows later, no second component needed for that screen.
import { cn } from '../lib/utils.js';

export function EntityItem({
  title,
  subtitle,
  meta,
  leading,
  actions,
  active = false,
  onSelect,
  className,
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center border-b border-[var(--hairline)]',
        active ? 'bg-[var(--surface-tint)]' : 'hover:bg-[var(--surface-field)]',
        className
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none focus-visible:bg-[var(--surface-tint)]"
        aria-current={active ? 'true' : undefined}
      >
        {active && (
          <span className="absolute inset-y-0 left-0 w-0.5 bg-[var(--brand-accent)]" />
        )}
        {leading && <span className="text-muted-foreground shrink-0">{leading}</span>}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-foreground truncate text-sm font-medium">{title}</span>
            {meta && <span className="text-muted-foreground shrink-0 text-xs">{meta}</span>}
          </span>
          {subtitle && (
            <span className="text-foreground-secondary truncate text-xs">{subtitle}</span>
          )}
        </span>
      </button>
      {actions && <div className="mr-3 flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function EntityList({ header, children, className }) {
  return (
    <section className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {header && (
        <div className="bg-background sticky top-0 z-10 border-b px-4 py-3">{header}</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
