// Lifted from dori-portal/components/ui/input.tsx (types stripped).
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '../../lib/utils.js';

export function Input({ className, type, ...props }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 border-input file:text-foreground placeholder:text-muted-foreground focus:border-brand-primary h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 max-lg:h-11 max-lg:px-3 md:text-sm',
        className
      )}
      {...props}
    />
  );
}
