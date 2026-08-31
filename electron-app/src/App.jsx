import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { InboxItem, InboxView } from './components/InboxItem.jsx';
import { Badge } from './components/ui/badge.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function App() {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.dori
      .call('list_inbox', {})
      .then(setInbox)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex h-screen flex-col">
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
    </div>
  );
}
