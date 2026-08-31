import { useEffect, useState, useCallback } from 'react';
import { Cpu, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';

const ENGINES = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'none', label: 'None (Unconfigured)' },
];

export function EnginePicker({ onEngineChange, className = '' }) {
  const [engine, setEngine] = useState('none');
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(() => {
    window.dori
      .call('get_engine_config', {})
      .then((cfg) => {
        const val = cfg?.replyCli || 'none';
        setEngine(val);
        onEngineChange?.(val);
      })
      .catch((err) => {
        console.error('Failed to get engine config:', err);
      })
      .finally(() => setLoading(false));
  }, [onEngineChange]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSelect = async (newVal) => {
    if (newVal === engine) return;
    setEngine(newVal);
    try {
      await window.dori.call('set_engine_config', { replyCli: newVal });
      onEngineChange?.(newVal);
    } catch (err) {
      console.error('Failed to set engine config:', err);
      fetchConfig();
    }
  };

  const currentLabel = ENGINES.find((e) => e.id === engine)?.label || 'Unconfigured';
  const isConfigured = engine === 'claude' || engine === 'codex';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Select value={engine} onValueChange={handleSelect}>
        <SelectTrigger size="sm" className="h-7 text-xs gap-1.5 px-2.5 font-medium border-border/70">
          <Cpu size={13} className={isConfigured ? 'text-primary' : 'text-muted-foreground'} />
          <SelectValue>
            <span className={isConfigured ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {currentLabel}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {ENGINES.map((e) => (
            <SelectItem key={e.id} value={e.id} className="text-xs">
              <span className="flex items-center gap-2">
                {e.label}
                {e.id === 'none' && (
                  <span className="text-[10px] text-muted-foreground">(Disabled)</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
