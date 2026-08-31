import { Inbox, Check } from 'lucide-react';
import { cn } from '../lib/utils.js';

const NAV = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'tasks', label: 'Tasks', icon: Check }
];

export function Sidebar({ active, onSelect }) {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40 p-2">
      <div className="px-2 py-3 text-sm font-semibold">Dori</div>
      {NAV.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
            active === id
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-foreground-secondary hover:bg-background/60'
          )}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </nav>
  );
}
