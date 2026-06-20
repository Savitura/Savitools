'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send,
  RotateCcw,
  Copy,
  Check,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchWebhookTemplates,
  sendWebhook,
  fetchWebhookHistory,
  replayWebhook,
  type WebhookTemplate,
  type WebhookHistoryEntry,
} from '@/lib/api';

function formatJson(data: unknown): string {
  try {
    if (typeof data === 'string') return data;
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusColor(status: number | null): string {
  if (!status) return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
  if (status >= 200 && status < 300)
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (status >= 300 && status < 400)
    return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (status >= 400 && status < 500)
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-red-500/15 text-red-400 border-red-500/30';
}

function buildCurl(entry: {
  endpointUrl: string;
  payload: Record<string, unknown>;
  requestHeaders: Record<string, string>;
}): string {
  const parts: string[] = ['curl', '-s', '-X', 'POST', `'${entry.endpointUrl}'`];

  for (const [key, value] of Object.entries(entry.requestHeaders)) {
    parts.push(`-H '${key}: ${value}'`);
  }

  parts.push(`-d '${JSON.stringify(entry.payload).replace(/'/g, "'\\''")}'`);

  return parts.join(' \\\n  ');
}

function buildLiveCurl(
  endpointUrl: string,
  payload: string,
  secret: string,
  signature: string,
): string {
  const parts: string[] = ['curl', '-s', '-X', 'POST', `'${endpointUrl}'`];

  parts.push("-H 'Content-Type: application/json'");

  if (secret) {
    parts.push(`-H 'X-SaviTools-Signature: sha256=${signature}'`);
  }

  parts.push(`-d '${payload.replace(/'/g, "'\\''")}'`);

  return parts.join(' \\\n  ');
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? 'Copied!' : label}
    </button>
  );
}

export function WebhookTester() {
  const [templates, setTemplates] = useState<WebhookTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [endpointUrl, setEndpointUrl] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');
  const [payloadEditor, setPayloadEditor] = useState('');
  const [payloadValid, setPayloadValid] = useState(true);
  const [secret, setSecret] = useState('');
  const [signature, setSignature] = useState('');

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WebhookHistoryEntry | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [history, setHistory] = useState<WebhookHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const data = await fetchWebhookTemplates();
      setTemplates(data);
      if (data.length > 0) {
        setSelectedEventType(data[0].eventType);
        setPayloadEditor(JSON.stringify(data[0].samplePayload, null, 2));
      }
    } catch (err) {
      setTemplatesError(
        err instanceof Error ? err.message : 'Failed to load templates',
      );
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchWebhookHistory();
      setHistory(data);
    } catch {
      // silently fail on history load
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadHistory();
  }, [loadTemplates, loadHistory]);

  useEffect(() => {
    if (!secret) {
      setSignature('');
      return;
    }
    try {
      const payloadBytes = new TextEncoder().encode(payloadEditor);
      const keyBytes = new TextEncoder().encode(secret);
      crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then((key) => crypto.subtle.sign('HMAC', key, payloadBytes))
        .then((sig) => {
          const hex = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          setSignature(hex);
        });
    } catch {
      setSignature('');
    }
  }, [secret, payloadEditor]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEventDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePayloadChange = (value: string) => {
    setPayloadEditor(value);
    try {
      JSON.parse(value);
      setPayloadValid(true);
    } catch {
      setPayloadValid(false);
    }
  };

  const handleEventTypeSelect = (eventType: string) => {
    setSelectedEventType(eventType);
    setEventDropdownOpen(false);
    const template = templates.find((t) => t.eventType === eventType);
    if (template) {
      const newPayload = JSON.stringify(template.samplePayload, null, 2);
      setPayloadEditor(newPayload);
      setPayloadValid(true);
    }
  };

  const handleSend = async () => {
    if (!endpointUrl || !selectedEventType || !payloadValid) return;

    let parsedPayload: Record<string, unknown> | undefined;
    try {
      parsedPayload = JSON.parse(payloadEditor);
    } catch {
      setSendError('Payload is not valid JSON');
      return;
    }

    setSending(true);
    setSendError(null);
    setResult(null);

    try {
      const entry = await sendWebhook({
        endpointUrl,
        eventType: selectedEventType,
        payload: parsedPayload,
        secret: secret || undefined,
      });
      setResult(entry);
      setHistory((prev) => [entry, ...prev].slice(0, 50));

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send webhook');
    } finally {
      setSending(false);
    }
  };

  const handleReplay = async (id: string) => {
    setSending(true);
    setSendError(null);
    setResult(null);

    try {
      const entry = await replayWebhook(id);
      setResult(entry);
      setHistory((prev) => [entry, ...prev].slice(0, 50));
      setSelectedHistoryId(entry.id);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.eventType === selectedEventType);
  const selectedHistoryEntry = history.find((h) => h.id === selectedHistoryId);
  const displayEntry = selectedHistoryEntry ?? result;

  if (templatesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading webhook templates…</p>
      </div>
    );
  }

  if (templatesError && templates.length === 0) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
        <AlertTriangle className="h-5 w-5 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-400">{templatesError}</p>
        <button
          type="button"
          onClick={() => void loadTemplates()}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Endpoint URL + Secret */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Endpoint URL
          </label>
          <input
            type="url"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            placeholder="https://example.com/webhooks/crowdpay"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Signing Secret
            <span className="text-muted-foreground/60 ml-1">(optional)</span>
          </label>
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="whsec_..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          {signature && (
            <p className="mt-1 text-[11px] font-mono text-muted-foreground truncate">
              sha256={signature}
            </p>
          )}
        </div>
      </div>

      {/* Event Type Selector */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Event Type
        </label>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setEventDropdownOpen(!eventDropdownOpen)}
            className="w-full flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-left"
          >
            <span className="truncate">
              {selectedTemplate
                ? `${selectedTemplate.eventType}`
                : 'Select an event type'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
          </button>

          {eventDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-64 overflow-auto">
              {templates.map((t) => (
                <button
                  key={t.eventType}
                  type="button"
                  onClick={() => handleEventTypeSelect(t.eventType)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors',
                    t.eventType === selectedEventType && 'bg-muted/50',
                  )}
                >
                  <span className="font-mono text-foreground">{t.eventType}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {t.provider}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedTemplate && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {selectedTemplate.description}
          </p>
        )}
      </div>

      {/* Payload Editor */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Payload
          </label>
          {!payloadValid && (
            <span className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Invalid JSON
            </span>
          )}
        </div>
        <textarea
          value={payloadEditor}
          onChange={(e) => handlePayloadChange(e.target.value)}
          spellCheck={false}
          className={cn(
            'w-full rounded-md border bg-background px-3 py-2 text-xs font-mono leading-relaxed resize-y min-h-[200px]',
            payloadValid ? 'border-border' : 'border-red-500/50',
          )}
        />
      </div>

      {/* Send + Curl */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !endpointUrl || !selectedEventType || !payloadValid}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            sending || !endpointUrl || !selectedEventType || !payloadValid
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <Send className="h-4 w-4" />
          {sending ? 'Sending…' : 'Send'}
        </button>

        {endpointUrl && payloadEditor && payloadValid && (
          <CopyButton
            text={buildLiveCurl(endpointUrl, payloadEditor, secret, signature)}
            label="Copy as cURL"
          />
        )}
      </div>

      {/* Send Error */}
      {sendError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="h-4 w-4" />
            {sendError}
          </div>
        </div>
      )}

      {/* Result Panel */}
      <div ref={resultRef}>
        {displayEntry ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold',
                  getStatusColor(displayEntry.statusCode),
                )}
              >
                {displayEntry.statusCode &&
                displayEntry.statusCode >= 200 &&
                displayEntry.statusCode < 300 ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {displayEntry.error ? 'ERR' : displayEntry.statusCode}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {displayEntry.endpointUrl}
              </span>
              <span className="text-xs text-muted-foreground">
                {displayEntry.latencyMs}ms
              </span>
              <div className="ml-auto">
                <CopyButton text={buildCurl(displayEntry)} label="Copy as cURL" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* Request */}
              <div className="p-4">
                <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Request
                </p>
                <div className="space-y-2">
                  <div className="text-xs font-mono">
                    <span className="text-muted-foreground">POST</span>{' '}
                    <span className="text-foreground break-all">
                      {displayEntry.endpointUrl}
                    </span>
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground mb-1">Headers</p>
                    <div className="rounded bg-muted/30 p-2 font-mono space-y-0.5">
                      {Object.entries(displayEntry.requestHeaders).map(
                        ([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-foreground shrink-0">{key}:</span>
                            <span className="text-muted-foreground break-all">
                              {value}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground mb-1">Body</p>
                    <pre className="rounded bg-muted/30 p-2 font-mono text-muted-foreground overflow-auto max-h-60 whitespace-pre-wrap break-all">
                      {formatJson(displayEntry.payload)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Response */}
              <div className="p-4">
                <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Response
                </p>
                {displayEntry.error ? (
                  <div className="rounded bg-red-500/5 border border-red-500/20 p-3">
                    <p className="text-xs text-red-400 font-mono">
                      {displayEntry.error}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-bold',
                          getStatusColor(displayEntry.statusCode),
                        )}
                      >
                        {displayEntry.statusCode}
                      </span>
                      <span className="text-muted-foreground">
                        {displayEntry.latencyMs}ms
                      </span>
                    </div>
                    <div className="text-xs">
                      <p className="text-muted-foreground mb-1">Headers</p>
                      <div className="rounded bg-muted/30 p-2 font-mono space-y-0.5 max-h-32 overflow-auto">
                        {Object.entries(displayEntry.responseHeaders).length >
                        0 ? (
                          Object.entries(displayEntry.responseHeaders).map(
                            ([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <span className="text-foreground shrink-0">
                                  {key}:
                                </span>
                                <span className="text-muted-foreground break-all">
                                  {value}
                                </span>
                              </div>
                            ),
                          )
                        ) : (
                          <span className="text-muted-foreground">
                            No headers
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs">
                      <p className="text-muted-foreground mb-1">Body</p>
                      <pre className="rounded bg-muted/30 p-2 font-mono text-muted-foreground overflow-auto max-h-60 whitespace-pre-wrap break-all">
                        {formatJson(displayEntry.responseBody)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
            <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Send a webhook to see the result
            </p>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Request History
            </p>
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Time
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Event
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Endpoint
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Latency
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedHistoryId(entry.id)}
                    className={cn(
                      'border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors',
                      selectedHistoryId === entry.id && 'bg-muted/40',
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      {entry.eventType}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">
                      {entry.endpointUrl}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold',
                          getStatusColor(entry.statusCode),
                        )}
                      >
                        {entry.error ? 'ERR' : entry.statusCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {entry.latencyMs}ms
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleReplay(entry.id);
                        }}
                        disabled={sending}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
