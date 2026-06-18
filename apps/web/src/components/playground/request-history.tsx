'use client';

import { cn } from '@/lib/utils';
import { Clock, ArrowRight } from 'lucide-react';

interface HistoryEntry {
  method: string;
  path: string;
  status: number | null;
  latencyMs: number;
  timestamp: number;
}

interface RequestHistoryProps {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  className?: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-blue-400',
  PUT: 'text-amber-400',
  DELETE: 'text-red-400',
  PATCH: 'text-purple-400',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function RequestHistory({ history, onSelect, className }: RequestHistoryProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <p className="text-[11px] font-medium text-muted-foreground">Recent Requests</p>
      </div>

      {history.map((entry, i) => (
        <button
          key={`${entry.timestamp}-${i}`}
          type="button"
          onClick={() => onSelect(entry)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <span
            className={cn('font-bold uppercase shrink-0', METHOD_COLORS[entry.method] ?? 'text-gray-400')}
          >
            {entry.method.slice(0, 3)}
          </span>
          <span className="font-mono truncate flex-1">{entry.path}</span>
          <span className={cn(
            'shrink-0',
            entry.status && entry.status >= 200 && entry.status < 300
              ? 'text-emerald-400'
              : 'text-red-400',
          )}>
            {entry.status ?? 'ERR'}
          </span>
          <span className="shrink-0 opacity-60">{entry.latencyMs}ms</span>
        </button>
      ))}
    </div>
  );
}
