// Lifted from dori-portal/components/controls/filter-chip.tsx (types stripped,
// .filter-chip class inlined as rounded-full — it was just border-radius: pill).
import { cn } from '../../lib/utils.js';

export function FilterChip({ selected = false, className, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-border hover:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
