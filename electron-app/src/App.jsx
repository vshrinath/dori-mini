import { useCallback, useEffect, useState } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import { InboxItem, InboxView } from './components/InboxItem.jsx';
import { Badge } from './components/ui/badge.jsx';
import { Button } from './components/ui/button.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { TasksView } from './components/TasksView.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function InboxScreen() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    window.dori
      .call('list_inbox', {})
      .then(setInbox)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  const decide = useCallback(
    (actionId, clarificationId) => {
      window.dori
        .call(actionId, { clarificationId })
        .then(refresh)
        .catch((e) => setError(e.message));
    },
    [refresh]
  );

  return (
    <InboxView header={<h1 className="text-sm font-semibold">Inbox</h1>}>
      {error && <p className="p-4 text-sm text-red-500">{error}</p>}
      {!error && !inbox && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {inbox?.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">Nothing pending.</p>
      )}
      {inbox?.map((item) => (
        <InboxItem
          key={item.clarificationId}
          title={item.title}
          subtitle={
            <Badge variant="muted" size="compact">
              {item.domain}
            </Badge>
          }
          meta={formatDate(item.createdAt)}
          statusIcon={<CircleHelp size={16} />}
          actions={
            item.clarificationId && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Approve"
                  onClick={() => decide('approve_inbox_item', item.clarificationId)}
                >
                  <Check size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ignore"
                  onClick={() => decide('ignore_inbox_item', item.clarificationId)}
                >
                  <X size={14} />
                </Button>
              </>
            )
          }
        />
      ))}
    </InboxView>
  );
}

export function App() {
  const [active, setActive] = useState('inbox');

  return (
    <div className="flex h-screen">
      <Sidebar active={active} onSelect={setActive} />
      <div className="flex min-w-0 flex-1 flex-col">
        {active === 'inbox' && <InboxScreen />}
        {active === 'tasks' && <TasksView />}
      </div>
    </div>
  );
}
