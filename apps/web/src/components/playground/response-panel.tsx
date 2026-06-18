'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import type { PlaygroundProxyResult } from '@/lib/api';

interface ResponsePanelProps {
  response: PlaygroundProxyResult | null;
  error: string | null;
  className?: string;
}

function formatJson(data: unknown): string {
  try {
    if (typeof data === 'string') return data;
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (status >= 300 && status < 400) return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (status >= 400 && status < 500) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-red-500/15 text-red-400 border-red-500/30';
}

export function ResponsePanel({ response, error, className }: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');

  if (error) {
    return (
      <div className={cn('rounded-lg border border-red-500/30 bg-red-500/5 p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-red-400">
          <XCircle className="h-4 w-4" />
          Request Failed
        </div>
        <p className="mt-2 text-xs text-muted-foreground font-mono">{error}</p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className={cn('rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center', className)}>
        <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Send a request to see the response</p>
      </div>
    );
  }

  const isSuccess = response.status >= 200 && response.status < 300;

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold',
            getStatusColor(response.status),
          )}
        >
          {isSuccess ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {response.status}
        </span>
        <span className="text-xs text-muted-foreground">{response.latencyMs}ms</span>

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('body')}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              activeTab === 'body'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Body
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              activeTab === 'headers'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Headers
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-auto">
        {activeTab === 'body' ? (
          <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
            {formatJson(response.body)}
          </pre>
        ) : (
          <div className="p-4 space-y-1">
            {Object.entries(response.headers).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs font-mono">
                <span className="text-foreground shrink-0">{key}:</span>
                <span className="text-muted-foreground break-all">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
