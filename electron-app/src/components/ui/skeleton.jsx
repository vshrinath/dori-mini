// Lifted from dori-portal/components/ui/skeleton.tsx.
import { cn } from '../../lib/utils.js';

export function Skeleton({ className, ...props }) {
  return <div data-slot="skeleton" className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}
