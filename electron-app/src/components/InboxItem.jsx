// Lifted from dori-portal/components/surfaces/inbox-view.tsx (types
// stripped). Thin wrapper over EntityItem/EntityList — its props line up
// almost 1:1 with dori-mini's list_inbox action output.
import { cn } from '../lib/utils.js';
import { EntityItem, EntityList } from './EntityItem.jsx';

export function InboxItem({ id, title, subtitle, meta, statusIcon, isActive, onClick, actions }) {
  return (
    <EntityItem
      title={title}
      subtitle={subtitle}
      meta={meta}
      leading={statusIcon}
      active={isActive}
      onSelect={onClick}
      actions={actions}
    />
  );
}

export function InboxView({ header, children, className }) {
  return (
    <EntityList header={header} className={cn('h-full', className)}>
      {children}
    </EntityList>
  );
}
