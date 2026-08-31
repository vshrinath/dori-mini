import * as React from 'react';
import { cn } from '../../lib/utils.js';

const TabsContext = React.createContext({
  value: '',
  onValueChange: () => {},
});

export function Tabs({ value, defaultValue, onValueChange, className, children, ...props }) {
  const [currentValue, setCurrentValue] = React.useState(value || defaultValue || '');

  React.useEffect(() => {
    if (value !== undefined) setCurrentValue(value);
  }, [value]);

  const handleValueChange = React.useCallback(
    (next) => {
      if (value === undefined) setCurrentValue(next);
      onValueChange?.(next);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className={cn('flex flex-col gap-4', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-panel border border-[var(--space-sidebar-border)] bg-[var(--surface-field)] p-1 text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className, children, ...props }) {
  const context = React.useContext(TabsContext);
  const isSelected = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={() => context.onValueChange(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-control px-4 py-1.5 text-[14.5px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        isSelected
          ? 'bg-card text-foreground font-semibold shadow-xs'
          : 'text-muted-foreground hover:text-foreground hover:bg-card/50',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children, ...props }) {
  const context = React.useContext(TabsContext);
  if (context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      tabIndex={0}
      className={cn('flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      {...props}
    >
      {children}
    </div>
  );
}
