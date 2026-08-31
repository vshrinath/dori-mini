import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function Breadcrumb({ className, children, ...props }) {
  return (
    <nav aria-label="breadcrumb" className={cn('flex items-center', className)} {...props}>
      {children}
    </nav>
  );
}

export function BreadcrumbList({ className, children, ...props }) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:gap-2', className)} {...props}>
      {children}
    </ol>
  );
}

export function BreadcrumbItem({ className, children, ...props }) {
  return (
    <li className={cn('inline-flex items-center gap-1.5', className)} {...props}>
      {children}
    </li>
  );
}

export function BreadcrumbLink({ className, onClick, children, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 transition-colors hover:text-foreground hover:underline underline-offset-2', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function BreadcrumbPage({ className, children, ...props }) {
  return (
    <span
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function BreadcrumbSeparator({ className, children, ...props }) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn('text-muted-foreground opacity-60 [&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight size={13} />}
    </li>
  );
}
