// Ported from dori-portal's lib/utils.ts. tailwind-merge doesn't know this
// project's custom `@theme inline` font-size scale (tokens.css), so a bare
// `text-{word}` class like `text-control` is indistinguishable from a color
// utility like `text-primary-foreground` to tailwind-merge's default
// heuristics -- combining the two in one cn() call silently drops one as a
// false "conflict". 2026-08-31: a prior version of this file dropped this
// customization on the stated assumption that "Dori Go doesn't use that
// custom type scale" -- that assumption was never checked against the code:
// tokens.css defines the full scale and button.jsx's buttonVariants uses
// text-control/text-control-lg directly, so every default-variant Button
// combining a size (text-control) with a color (text-primary-foreground)
// silently lost its text color -- e.g. the chat send button's icon
// rendering near-black on a navy background, invisible.
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMergeCustom = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-display',
        'text-heading-lg',
        'text-heading',
        'text-title',
        'text-body',
        'text-control',
        'text-control-lg',
        'text-label',
        'text-caption',
        'text-micro',
      ],
    },
  },
});

export function cn(...inputs) {
  return twMergeCustom(clsx(inputs));
}
