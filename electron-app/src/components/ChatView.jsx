import { useEffect, useState, useRef } from 'react';
import {
  Send,
  AlertCircle,
  RefreshCw,
  Folder,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import { EnginePicker } from './EnginePicker.jsx';
import { cn } from '../lib/utils.js';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const STARTER_PROMPTS = [
  'What’s waiting on me this week?',
  'Search my notes across the vault',
  'Draft a follow-up note from yesterday',
  'What are my open high priority tasks?',
];

export function ChatView({ projectContext = null, className = '', onOpenSettings }) {
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
    if (messages.length > 0) scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    window.dori?.call('get_engine_config', {})
      .then((cfg) => {
        if (cfg?.replyCli) setEngine(cfg.replyCli);
      })
      .catch(() => {});
  }, []);

  const handleSendText = async (textToSend) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    if (engine === 'none') {
      setErrorMessage('AI is not configured. Please select an AI Engine in Settings or the picker below.');
      return;
    }

    const userTurn = { role: 'user', text, timestamp: new Date().toISOString() };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setInput('');
    setIsLoading(true);
    setErrorMessage(null);

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
      handleSendText();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const isConfigured = engine === 'claude' || engine === 'codex';
  const isChatting = messages.length > 0 || isLoading;

  return (
    <div className={cn('home-focus flex flex-col', isChatting && 'is-chatting', className)}>
      {/* Header bar (only when chatting or project scoped) */}
      {isChatting && (
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[var(--surface-canvas)]/90 backdrop-blur-md px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-tint)]">
              <img src="./assets/icon.png" alt="" className="h-3.5 w-3.5 rounded-sm" />
            </div>
            <span className="font-display text-sm font-semibold text-foreground">
              {projectContext ? `Project: ${projectContext}` : 'Dori'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <EnginePicker onEngineChange={setEngine} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMessages([])}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
              title="New Chat"
            >
              <RefreshCw size={13} />
            </Button>
          </div>
        </div>
      )}

      {/* Main Home Canvas Area */}
      <div className="home-focus-inner">
        {/* Idle Hero Stage */}
        {!isChatting && (
          <div className="home-hero-stage anim-rise">
            <img
              src="./assets/icon.png"
              alt="Dori"
              className="home-hero-logo"
            />
            <p className="home-focus-kicker">{getGreeting()}</p>
            <h1 className="home-hero-title">
              {projectContext ? `Where should we begin on ${projectContext}?` : 'Where should we begin?'}
            </h1>
          </div>
        )}

        {/* Conversation Stream */}
        {isChatting && (
          <div className="flex-1 space-y-6 pb-6">
            {!isConfigured && (
              <div className="rounded-panel border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-3">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold mb-0.5">AI Engine Not Configured</div>
                  <p className="text-muted-foreground leading-relaxed">
                    Select Claude Code or Codex in Settings or using the picker below to enable AI chat.
                  </p>
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div
                key={idx}
                className={cn('flex flex-col anim-rise', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <span className="text-[10px] font-semibold text-muted-foreground mb-1 px-1 uppercase tracking-wider">
                  {m.role === 'user' ? 'You' : 'Dori'}
                </span>
                <div
                  className={cn(
                    'rounded-2xl text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'max-w-xl bg-primary text-primary-foreground px-4 py-2.5 rounded-tr-sm shadow-xs'
                      : 'w-full max-w-2xl bg-card border border-[var(--border-soft)] px-5 py-4 rounded-tl-sm shadow-xs prose prose-sm dark:prose-invert'
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start flex-col anim-rise">
                <span className="text-[10px] font-semibold text-muted-foreground mb-1 px-1 uppercase tracking-wider">
                  Dori
                </span>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-card border border-[var(--border-soft)] px-4 py-3 text-xs text-muted-foreground shadow-xs">
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.3s]" />
                  </div>
                  <span className="ml-1 font-medium">Thinking…</span>
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
        )}

        {/* Signature 20px Dori Composer Capsule */}
        <div className="w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendText();
            }}
            className="chat-dock-composer"
          >
            <button
              type="button"
              className="quick-capture-icon-button"
              title="Add context"
              aria-label="Add"
            >
              <Plus size={18} />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isConfigured
                  ? projectContext
                    ? `Message in ${projectContext}…`
                    : 'Message, capture, or ask…'
                  : 'Select an AI engine below to start…'
              }
              disabled={isLoading}
              className="quick-capture-input"
            />

            <div className="flex items-center gap-2 shrink-0">
              <EnginePicker onEngineChange={setEngine} />

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="quick-capture-send-button"
                title="Send (Enter)"
                aria-label="Send"
              >
                <Send size={13} className="ml-0.5" />
              </button>
            </div>
          </form>

          {/* Idle Starter Prompt Chips */}
          {!isChatting && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {STARTER_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendText(prompt)}
                  className="chat-starter-chip"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
