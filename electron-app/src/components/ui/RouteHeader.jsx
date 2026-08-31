import { ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function RouteHeader({
  title,
  description,
  back,
  actions,
  meta,
  className,
}) {
  return (
    <header className={cn('route-header', className)}>
      <div className="route-header__copy">
        {back ? (
          <button
            type="button"
            className="route-header__back inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
            onClick={back.onClick}
          >
            <ArrowLeft aria-hidden="true" size={14} />
            <span>{back.label}</span>
          </button>
        ) : null}
        <div className="route-header__title-row">
          <h1 className="route-header__title">{title}</h1>
          {meta}
        </div>
        {description ? (
          <p className="route-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="route-header__actions">{actions}</div> : null}
    </header>
  );
}
