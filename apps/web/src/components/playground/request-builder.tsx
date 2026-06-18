'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Send, Loader2, Trash2, Plus } from 'lucide-react';

interface RequestParam {
  name: string;
  value: string;
  required?: boolean;
  in: string;
}

interface RequestBuilderProps {
  method: string;
  path: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: { type?: string };
    description?: string;
  }>;
  hasBody: boolean;
  useAuth: boolean;
  onUseAuthChange: (value: boolean) => void;
  onSend: (config: {
    pathParams: Record<string, string>;
    queryParams: Record<string, string>;
    body: string;
    headers: Record<string, string>;
  }) => void;
  loading: boolean;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
  PATCH: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export function RequestBuilder({
  method,
  path,
  parameters,
  hasBody,
  useAuth,
  onUseAuthChange,
  onSend,
  loading,
}: RequestBuilderProps) {
  const pathParams = parameters?.filter((p) => p.in === 'path') ?? [];
  const queryParams = parameters?.filter((p) => p.in === 'query') ?? [];

  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [extraQueryParams, setExtraQueryParams] = useState<Array<{ name: string; value: string }>>([]);
  const [body, setBody] = useState('');
  const [customHeaders, setCustomHeaders] = useState<Array<{ name: string; value: string }>>([]);

  const resolvedPath = pathParams.reduce(
    (acc, param) => acc.replace(`{${param.name}}`, pathValues[param.name] ?? `{${param.name}}`),
    path,
  );

  const handleSend = () => {
    const query: Record<string, string> = {};
    for (const param of queryParams) {
      if (queryValues[param.name]) {
        query[param.name] = queryValues[param.name];
      }
    }
    for (const extra of extraQueryParams) {
      if (extra.name && extra.value) {
        query[extra.name] = extra.value;
      }
    }

    const headers: Record<string, string> = {};
    for (const h of customHeaders) {
      if (h.name && h.value) {
        headers[h.name] = h.value;
      }
    }

    onSend({
      pathParams: { ...pathValues },
      queryParams: query,
      body,
      headers,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded border px-2.5 py-1 text-xs font-bold uppercase',
            METHOD_COLORS[method] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30',
          )}
        >
          {method}
        </span>
        <code className="flex-1 text-xs font-mono text-muted-foreground truncate">{resolvedPath}</code>
      </div>

      {pathParams.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Path Parameters</p>
          {pathParams.map((param) => (
            <div key={param.name} className="flex items-center gap-2">
              <label className="text-[11px] font-mono text-muted-foreground w-24 shrink-0">
                {param.name}
                {param.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type="text"
                value={pathValues[param.name] ?? ''}
                onChange={(e) => setPathValues((prev) => ({ ...prev, [param.name]: e.target.value }))}
                placeholder={param.schema?.type ?? 'string'}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs font-mono"
              />
            </div>
          ))}
        </div>
      )}

      {(queryParams.length > 0 || extraQueryParams.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Query Parameters</p>
          {queryParams.map((param) => (
            <div key={param.name} className="flex items-center gap-2">
              <label className="text-[11px] font-mono text-muted-foreground w-24 shrink-0">
                {param.name}
                {param.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type="text"
                value={queryValues[param.name] ?? ''}
                onChange={(e) => setQueryValues((prev) => ({ ...prev, [param.name]: e.target.value }))}
                placeholder={param.description ?? param.schema?.type ?? 'string'}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs font-mono"
              />
            </div>
          ))}
          {extraQueryParams.map((param, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={param.name}
                onChange={(e) => {
                  const updated = [...extraQueryParams];
                  updated[i] = { ...updated[i], name: e.target.value };
                  setExtraQueryParams(updated);
                }}
                placeholder="key"
                className="w-24 rounded border border-input bg-background px-2 py-1 text-xs font-mono"
              />
              <input
                type="text"
                value={param.value}
                onChange={(e) => {
                  const updated = [...extraQueryParams];
                  updated[i] = { ...updated[i], value: e.target.value };
                  setExtraQueryParams(updated);
                }}
                placeholder="value"
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setExtraQueryParams((prev) => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExtraQueryParams((prev) => [...prev, { name: '', value: '' }])}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add parameter
          </button>
        </div>
      )}

      {hasBody && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Request Body (JSON)</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{ "key": "value" }'
            rows={6}
            className="w-full rounded border border-input bg-background px-3 py-2 text-xs font-mono resize-y"
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Headers</p>
          <button
            type="button"
            onClick={() => setCustomHeaders((prev) => [...prev, { name: '', value: '' }])}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add header
          </button>
        </div>
        {customHeaders.map((header, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={header.name}
              onChange={(e) => {
                const updated = [...customHeaders];
                updated[i] = { ...updated[i], name: e.target.value };
                setCustomHeaders(updated);
              }}
              placeholder="Header-Name"
              className="w-40 rounded border border-input bg-background px-2 py-1 text-xs font-mono"
            />
            <input
              type="text"
              value={header.value}
              onChange={(e) => {
                const updated = [...customHeaders];
                updated[i] = { ...updated[i], value: e.target.value };
                setCustomHeaders(updated);
              }}
              placeholder="value"
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => setCustomHeaders((prev) => prev.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={useAuth}
            onChange={(e) => onUseAuthChange(e.target.checked)}
            className="rounded border-input"
          />
          Use stored API key
        </label>
        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </div>
    </div>
  );
}
