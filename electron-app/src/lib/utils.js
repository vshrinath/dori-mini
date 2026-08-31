// Simplified from dori-portal's lib/utils.ts — dropped the custom
// extendTailwindMerge font-size class groups (text-display, text-control,
// etc.) since Dori Go doesn't use that custom type scale.
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
