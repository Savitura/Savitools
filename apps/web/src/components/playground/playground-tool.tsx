'use client';

import { useCallback, useEffect, useState } from 'react';
import { ToolEmptyState } from '@/components/tools/tool-empty-state';
import { ApiSelector } from './api-selector';
import { CopyCurlButton } from './copy-curl-button';
import { EndpointBrowser } from './endpoint-browser';
import { KeyManager } from './key-manager';
import { RequestBuilder } from './request-builder';
import { RequestHistory } from './request-history';
import { ResponsePanel } from './response-panel';
import {
  fetchPlaygroundSpec,
  proxyPlaygroundRequest,
  type PlaygroundProvider,
  type PlaygroundProxyResult,
} from '@/lib/api';

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

interface HistoryEntry {
  method: string;
  path: string;
  status: number | null;
  latencyMs: number;
  timestamp: number;
}

export function PlaygroundTool() {
  const [provider, setProvider] = useState<PlaygroundProvider>('fluxa');
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);

  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [useAuth, setUseAuth] = useState(true);
  const [requestLoading, setRequestLoading] = useState(false);
  const [response, setResponse] = useState<PlaygroundProxyResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadSpec = useCallback(async (p: PlaygroundProvider) => {
    setSpecLoading(true);
    setSpecError(null);
    setSpec(null);
    setSelectedEndpoint(null);
    setResponse(null);
    setRequestError(null);

    try {
      const result = await fetchPlaygroundSpec(p);
      setSpec(result.spec);
    } catch (err) {
      setSpecError(err instanceof Error ? err.message : 'Failed to load API spec');
    } finally {
      setSpecLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSpec(provider);
  }, [provider, loadSpec]);

  const handleSelectEndpoint = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint);
    setResponse(null);
    setRequestError(null);
  };

  const handleSend = async (config: {
    pathParams: Record<string, string>;
    queryParams: Record<string, string>;
    body: string;
    headers: Record<string, string>;
  }) => {
    if (!selectedEndpoint) return;

    setRequestLoading(true);
    setResponse(null);
    setRequestError(null);

    let resolvedPath = selectedEndpoint.path;
    for (const [key, value] of Object.entries(config.pathParams)) {
      resolvedPath = resolvedPath.replace(`{${key}}`, value);
    }

    let parsedBody: unknown;
    if (config.body && selectedEndpoint.method !== 'GET' && selectedEndpoint.method !== 'HEAD') {
      try {
        parsedBody = JSON.parse(config.body);
      } catch {
        setRequestError('Invalid JSON in request body');
        setRequestLoading(false);
        return;
      }
    }

    try {
      const result = await proxyPlaygroundRequest({
        provider,
        method: selectedEndpoint.method,
        path: resolvedPath,
        query: Object.keys(config.queryParams).length > 0 ? config.queryParams : undefined,
        body: parsedBody,
        headers: Object.keys(config.headers).length > 0 ? config.headers : undefined,
      });

      setResponse(result);

      setHistory((prev) => {
        const entry: HistoryEntry = {
          method: selectedEndpoint.method,
          path: resolvedPath,
          status: result.status,
          latencyMs: result.latencyMs,
          timestamp: Date.now(),
        };
        return [entry, ...prev].slice(0, 10);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setRequestError(message);

      setHistory((prev) => {
        const entry: HistoryEntry = {
          method: selectedEndpoint.method,
          path: resolvedPath,
          status: null,
          latencyMs: 0,
          timestamp: Date.now(),
        };
        return [entry, ...prev].slice(0, 10);
      });
    } finally {
      setRequestLoading(false);
    }
  };

  const handleProviderChange = (p: PlaygroundProvider) => {
    setProvider(p);
  };

  if (!spec && specLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading API specification…</p>
      </div>
    );
  }

  if (specError && !spec) {
    return (
      <ToolEmptyState
        message={`Failed to load the ${provider === 'fluxa' ? 'Fluxa' : 'CrowdPay'} API specification. ${specError}`}
        exampleLabel="Retry"
        onExample={() => void loadSpec(provider)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ApiSelector selected={provider} onSelect={handleProviderChange} className="flex-1" />
        <KeyManager provider={provider} />
      </div>

      {spec && (
        <div className="flex gap-4 min-h-[500px]">
          <EndpointBrowser
            spec={spec}
            selectedEndpoint={selectedEndpoint}
            onSelect={handleSelectEndpoint}
            className="w-64 shrink-0 rounded-lg border border-border p-3"
          />

          <div className="flex-1 space-y-4 min-w-0">
            {selectedEndpoint ? (
              <>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">{selectedEndpoint.summary}</p>
                    <CopyCurlButton
                      method={selectedEndpoint.method}
                      path={selectedEndpoint.path}
                      body=""
                      useAuth={useAuth}
                      provider={provider}
                    />
                  </div>
                  <RequestBuilder
                    method={selectedEndpoint.method}
                    path={selectedEndpoint.path}
                    parameters={selectedEndpoint.parameters}
                    hasBody={!!selectedEndpoint.requestBody}
                    useAuth={useAuth}
                    onUseAuthChange={setUseAuth}
                    onSend={(config) => void handleSend(config)}
                    loading={requestLoading}
                  />
                </div>

                <ResponsePanel response={response} error={requestError} />
              </>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16">
                <p className="text-sm text-muted-foreground">
                  Select an endpoint from the sidebar to get started
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <RequestHistory history={history} onSelect={() => {}} />
        </div>
      )}
    </div>
  );
}
