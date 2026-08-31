import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';
import { Button } from './button.jsx';

const attachmentVariants = cva(
  'group/attachment relative flex w-fit max-w-full min-w-0 shrink-0 flex-wrap rounded-panel border border-[var(--space-sidebar-border)] bg-card text-card-foreground transition-all hover:border-[var(--hairline-strong)] hover:shadow-2xs focus-within:ring-1 focus-within:ring-ring/50 data-[state=error]:border-destructive/30 data-[state=idle]:border-dashed',
  {
    variants: {
      size: {
        default: 'gap-3 text-sm p-2.5',
        sm: 'gap-2.5 text-xs p-2',
        xs: 'gap-1.5 rounded-control text-xs p-1.5',
      },
      orientation: {
        horizontal: 'min-w-[14rem] items-center',
        vertical: 'w-28 flex-col',
      },
    },
    defaultVariants: {
      size: 'default',
      orientation: 'horizontal',
    },
  }
);

export function Attachment({
  className,
  state = 'done',
  size = 'default',
  orientation = 'horizontal',
  ...props
}) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      data-size={size}
      data-orientation={orientation}
      className={cn(attachmentVariants({ size, orientation }), className)}
      {...props}
    />
  );
}

export function AttachmentMedia({ className, children, ...props }) {
  return (
    <div
      data-slot="attachment-media"
      className={cn(
        'relative flex aspect-square w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-[var(--surface-field)] text-foreground shadow-2xs',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AttachmentContent({ className, ...props }) {
  return (
    <div
      data-slot="attachment-content"
      className={cn('max-w-full min-w-0 flex-1 leading-tight', className)}
      {...props}
    />
  );
}

export function AttachmentTitle({ className, ...props }) {
  return (
    <span
      data-slot="attachment-title"
      className={cn('block max-w-full min-w-0 truncate text-[14px] font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function AttachmentDescription({ className, ...props }) {
  return (
    <span
      data-slot="attachment-description"
      className={cn('mt-0.5 block min-w-0 truncate text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function AttachmentActions({ className, ...props }) {
  return (
    <div
      data-slot="attachment-actions"
      className={cn('relative z-20 flex shrink-0 items-center gap-1', className)}
      {...props}
    />
  );
}

export function AttachmentAction({ className, variant = 'ghost', size = 'sm', ...props }) {
  return (
    <Button
      data-slot="attachment-action"
      variant={variant}
      size={size}
      className={cn('h-7 w-7 p-0 text-muted-foreground hover:text-foreground', className)}
      {...props}
    />
  );
}

export function AttachmentGroup({ className, ...props }) {
  return (
    <div
      data-slot="attachment-group"
      className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5', className)}
      {...props}
    />
  );
}
