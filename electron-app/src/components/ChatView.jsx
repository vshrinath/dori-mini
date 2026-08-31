import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, AlertCircle, RefreshCw, Folder } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { EnginePicker } from './EnginePicker.jsx';

export function ChatView({ projectContext = null, className = '' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [engine, setEngine] = useState('none');
  const [errorMessage, setErrorMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (engine === 'none') {
      setErrorMessage('AI is not configured. Please select Claude Code or Codex in the engine picker.');
      return;
    }

    const userTurn = { role: 'user', text, timestamp: new Date().toISOString() };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setInput('');
    setIsLoading(true);
    setErrorMessage(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await window.dori.call('chat_send', {
        message: text,
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        projectContext: projectContext || undefined,
      });

      const doriTurn = {
        role: 'dori',
        text: response.reply,
        timestamp: response.timestamp || new Date().toISOString(),
      };
      setMessages([...nextHistory, doriTurn]);
    } catch (err) {
      console.error('Chat error:', err);
      if (err.message?.includes('not configured')) {
        setErrorMessage('AI engine is not configured.');
      } else {
        setErrorMessage(err.message || 'Failed to get a reply from the CLI.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const isConfigured = engine === 'claude' || engine === 'codex';

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-tint)]">
            <img src="./assets/icon.png" alt="" className="h-4 w-4 rounded-full" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {projectContext ? 'Project Chat' : 'Dori Assistant'}
            </h1>
          </div>
          {projectContext && (
            <Badge variant="muted" size="compact" className="gap-1 font-mono text-[10px]">
              <Folder size={11} />
              <span>{projectContext}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <EnginePicker onEngineChange={setEngine} />
          {messages.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMessages([])}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
              title="Clear conversation"
            >
              <RefreshCw size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
        {/* Unconfigured state warning banner */}
        {!isConfigured && (
          <div className="rounded-panel border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-3">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold mb-1">AI Engine Not Configured</div>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Dori Go uses your local coding-agent CLI (Claude Code or Codex) to answer chat. Select a provider in the top right to start chatting.
              </p>
            </div>
          </div>
        )}

        {messages.length === 0 && isConfigured && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <img src="./assets/icon.png" alt="" className="h-7 w-7 rounded-full" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              {projectContext ? `Ask anything about ${projectContext}` : 'How can Dori help today?'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Search notes, list pending tasks, capture ideas, or ask questions across your vault.
            </p>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                {m.role === 'user' ? 'You' : 'Dori'}
              </span>
            </div>
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : 'bg-muted/70 text-foreground border border-border/50 rounded-tl-sm prose prose-sm max-w-none dark:prose-invert'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start flex-col">
            <span className="text-[10px] font-medium text-muted-foreground mb-1 px-1">Dori</span>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted/70 border border-border/50 px-4 py-3 text-xs text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span>Thinking…</span>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer Input Bar */}
      <div className="border-t border-border bg-card p-4">
        <div className="mx-auto max-w-3xl flex items-end gap-2 rounded-panel border border-border bg-background p-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isConfigured
                ? projectContext
                  ? `Message in ${projectContext}… (Enter to send)`
                  : 'Ask Dori anything… (Enter to send, Shift+Enter for new line)'
                : 'Select an AI engine above to enable chat'
            }
            disabled={!isConfigured || isLoading}
            className="min-h-[38px] max-h-[180px] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || !isConfigured || isLoading}
            className="h-8 w-8 rounded-lg p-0 shrink-0"
            title="Send (Enter)"
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
