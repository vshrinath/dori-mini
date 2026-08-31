// Shared motion constants matching tokens.css canonical product curves.
// Enforces constraint.shell.shared-motion-constants: animated transitions
// (sidebar switch, slideover open/close, search modal open/close) must use
// one shared set of duration and easing constants rather than magic numbers.

export const DURATION = {
  quick: 120, // ms
  exit: 140, // ms
  enter: 180, // ms
  normal: 200, // ms
  soft: 220, // ms
  spring: 300, // ms
  slow: 320, // ms
};

// easeOut/easeOutStrong/easeEnter reference tokens.css's own custom
// properties (--ease-out-strong, --ease-in-out-strong, the curve portion of
// --motion-enter) rather than duplicating their cubic-bezier values as
// separate literals -- two copies of the same curve drift silently if
// tokens.css is ever updated and this file isn't. easeSoft/easeSpring have
// no tokens.css counterpart yet, so they stay literal values here.
export const EASING = {
  easeOut: 'var(--ease-out-strong)',
  easeOutStrong: 'var(--ease-out-strong)',
  easeEnter: 'cubic-bezier(0.16, 1, 0.3, 1)', // matches tokens.css's --motion-enter curve; no standalone easing-only var exists for it yet
  easeSoft: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

export const TRANSITION = {
  slideover: `transform ${DURATION.enter}ms ${EASING.easeOut}, opacity ${DURATION.enter}ms ${EASING.easeOut}`,
  modal: `transform ${DURATION.quick}ms ${EASING.easeOut}, opacity ${DURATION.quick}ms ${EASING.easeOut}`,
  backdrop: `opacity ${DURATION.quick}ms ${EASING.easeOut}`,
  fade: `opacity ${DURATION.enter}ms ${EASING.easeOut}`,
};
