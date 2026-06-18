'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: { type?: string };
    description?: string;
  }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
}

interface EndpointBrowserProps {
  spec: Record<string, unknown>;
  selectedEndpoint: { method: string; path: string } | null;
  onSelect: (endpoint: Endpoint) => void;
  className?: string;
}

function parseSpec(spec: Record<string, unknown>): Record<string, Endpoint[]> {
  const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>> | undefined;
  if (!paths) return {};

  const grouped: Record<string, Endpoint[]> = {};

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters') continue;

      const tags = operation.tags as string[] | undefined;
      const tag = tags?.[0] ?? 'Other';

      const endpoint: Endpoint = {
        method: method.toUpperCase(),
        path,
        summary: (operation.summary as string) ?? '',
        operationId: operation.operationId as string | undefined,
        parameters: operation.parameters as Endpoint['parameters'],
        requestBody: operation.requestBody as Endpoint['requestBody'],
      };

      if (!grouped[tag]) grouped[tag] = [];
      grouped[tag].push(endpoint);
    }
  }

  return grouped;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-400',
  PUT: 'bg-amber-500/15 text-amber-400',
  DELETE: 'bg-red-500/15 text-red-400',
  PATCH: 'bg-purple-500/15 text-purple-400',
};

export function EndpointBrowser({ spec, selectedEndpoint, onSelect, className }: EndpointBrowserProps) {
  const [search, setSearch] = useState('');
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const grouped = parseSpec(spec);

  const allTags = Object.keys(grouped).sort();
  const filteredTags = allTags.filter((tag) => {
    if (!search) return true;
    return grouped[tag].some(
      (ep) =>
        ep.path.toLowerCase().includes(search.toLowerCase()) ||
        ep.summary.toLowerCase().includes(search.toLowerCase()),
    );
  });

  const toggleTag = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter endpoints…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs"
        />
      </div>

      <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-28rem)]">
        {filteredTags.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No endpoints found</p>
        )}

        {filteredTags.map((tag) => {
          const isExpanded = expandedTags.has(tag) || filteredTags.length === 1;
          const endpoints = grouped[tag].filter(
            (ep) =>
              !search ||
              ep.path.toLowerCase().includes(search.toLowerCase()) ||
              ep.summary.toLowerCase().includes(search.toLowerCase()),
          );

          return (
            <div key={tag}>
              <button
                type="button"
                onClick={() => toggleTag(tag)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {tag}
                <span className="ml-auto text-[10px] opacity-60">{endpoints.length}</span>
              </button>

              {isExpanded && (
                <div className="ml-2 space-y-0.5">
                  {endpoints.map((ep) => {
                    const isSelected =
                      selectedEndpoint?.method === ep.method && selectedEndpoint?.path === ep.path;

                    return (
                      <button
                        key={`${ep.method}-${ep.path}`}
                        type="button"
                        onClick={() => onSelect(ep)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0',
                            METHOD_COLORS[ep.method] ?? 'bg-gray-500/15 text-gray-400',
                          )}
                        >
                          {ep.method.slice(0, 3)}
                        </span>
                        <span className="text-[11px] font-mono truncate">{ep.path}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
