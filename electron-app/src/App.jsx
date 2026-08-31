import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { InboxItem, InboxView } from './components/InboxItem.jsx';
import { Badge } from './components/ui/badge.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { TasksView } from './components/TasksView.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function InboxScreen() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.dori
      .call('list_inbox', {})
      .then(setInbox)
      .catch((e) => setError(e.message));
  }, []);

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
