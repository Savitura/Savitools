'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  registerWebhook,
  getWebhookEventTypes,
  fireWebhookEvent,
  getWebhookDeliveries,
  type WebhookEndpointInfo,
  type WebhookEventType,
  type WebhookDeliveryInfo,
  type FireEventResult,
} from '@/lib/api';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Send,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DELIVERY_STORAGE_KEY = 'savitools:webhooks:deliveries';

function loadLocalDeliveries(): Record<string, WebhookDeliveryInfo[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DELIVERY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalDeliveries(deliveries: Record<string, WebhookDeliveryInfo[]>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(deliveries));
}

function StatusBadge({ status }: { status: number }) {
  if (status === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
        <XCircle className="h-3 w-3" />
        ERR
      </span>
    );
  }
  if (status >= 200 && status < 300) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        {status}
      </span>
    );
  }
  if (status >= 300 && status < 400) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
      <AlertCircle className="h-3 w-3" />
      {status}
    </span>
  );
}

export function WebhooksTool() {
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [endpoint, setEndpoint] = useState<WebhookEndpointInfo | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const [firing, setFiring] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FireEventResult | null>(null);

  const [deliveries, setDeliveries] = useState<WebhookDeliveryInfo[]>([]);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const [previewEventType, setPreviewEventType] = useState<string>('contribution.created');
  const [previewCopied, setPreviewCopied] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['crowdpay', 'fluxa']));

  useEffect(() => {
    async function load() {
      try {
        const types = await getWebhookEventTypes();
        setEventTypes(types);
      } catch {
        // fallback event types if API is unavailable
        setEventTypes([
          { type: 'contribution.created', provider: 'crowdpay', label: 'Contribution Created', description: 'A new contribution was made to a campaign', samplePayload: {} },
          { type: 'campaign.funded', provider: 'crowdpay', label: 'Campaign Funded', description: 'Campaign reached its goal', samplePayload: {} },
          { type: 'campaign.failed', provider: 'crowdpay', label: 'Campaign Failed', description: 'Campaign ended without reaching goal', samplePayload: {} },
          { type: 'withdrawal.approved', provider: 'crowdpay', label: 'Withdrawal Approved', description: 'Withdrawal request approved', samplePayload: {} },
          { type: 'transfer.settled', provider: 'fluxa', label: 'Transfer Settled', description: 'Transfer completed', samplePayload: {} },
          { type: 'transfer.failed', provider: 'fluxa', label: 'Transfer Failed', description: 'Transfer failed', samplePayload: {} },
          { type: 'wallet.funded', provider: 'fluxa', label: 'Wallet Funded', description: 'Wallet received deposit', samplePayload: {} },
          { type: 'conversion.completed', provider: 'fluxa', label: 'Conversion Completed', description: 'Asset conversion done', samplePayload: {} },
        ]);
      } finally {
        setLoadingEvents(false);
      }
    }
    void load();
  }, []);

  const toggleEvent = (eventType: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventType)) {
        next.delete(eventType);
      } else {
        next.add(eventType);
      }
      return next;
    });
  };

  const toggleGroup = (provider: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const selectAllForProvider = (provider: string) => {
    const providerEvents = eventTypes
      .filter((e) => e.provider === provider)
      .map((e) => e.type);
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      for (const evt of providerEvents) next.add(evt);
      return next;
    });
  };

  const handleRegisterAndFire = async () => {
    if (!url.trim() || selectedEvents.size === 0) return;

    setRegistering(true);
    setRegisterError('');
    setLastResult(null);

    try {
      const ep = await registerWebhook(url.trim(), Array.from(selectedEvents));
      setEndpoint(ep);

      const firstEvent = Array.from(selectedEvents)[0];
      const result = await fireWebhookEvent(ep.id, firstEvent);
      setLastResult(result);

      const newDelivery: WebhookDeliveryInfo = {
        id: crypto.randomUUID(),
        eventType: result.eventType,
        payload: result.payload,
        signature: result.signature,
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        latencyMs: result.latencyMs,
        createdAt: new Date().toISOString(),
      };

      const updatedDeliveries = [newDelivery, ...deliveries];
      setDeliveries(updatedDeliveries);

      const local = loadLocalDeliveries();
      local[ep.id] = updatedDeliveries;
      saveLocalDeliveries(local);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleFireEvent = async (eventType: string) => {
    if (!endpoint) return;

    setFiring(eventType);
    try {
      const result = await fireWebhookEvent(endpoint.id, eventType);
      setLastResult(result);

      const newDelivery: WebhookDeliveryInfo = {
        id: crypto.randomUUID(),
        eventType: result.eventType,
        payload: result.payload,
        signature: result.signature,
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        latencyMs: result.latencyMs,
        createdAt: new Date().toISOString(),
      };

      const updatedDeliveries = [newDelivery, ...deliveries];
      setDeliveries(updatedDeliveries);

      const local = loadLocalDeliveries();
      local[endpoint.id] = updatedDeliveries;
      saveLocalDeliveries(local);
    } catch {
      // handled by result
    } finally {
      setFiring(null);
    }
  };

  const handleCopyCurl = async () => {
    if (!lastResult) return;
    const curl = [
      'curl -X POST',
      `  "${url}"`,
      `  -H "Content-Type: application/json"`,
      `  -H "X-Savitura-Signature: t=${Date.now()},s=${lastResult.signature}"`,
      `  -H "X-Savitura-Event: ${lastResult.eventType}"`,
      `  -d '${JSON.stringify(lastResult.payload)}'`,
    ].join(' \\\n');
    await navigator.clipboard.writeText(curl);
  };

  const previewPayload = eventTypes.find((e) => e.type === previewEventType)?.samplePayload;

  const providerOrder = ['crowdpay', 'fluxa'];
  const groupedEvents = providerOrder.map((provider) => ({
    provider,
    label: provider === 'crowdpay' ? 'CrowdPay' : 'Fluxa',
    events: eventTypes.filter((e) => e.provider === provider),
  }));

  return (
    <div className="space-y-6">
      {/* Registration Card */}
      <div className="rounded-lg border border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Webhook Endpoint
          </h2>
          {endpoint && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
              Registered
            </span>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Endpoint URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setEndpoint(null);
              setLastResult(null);
            }}
            placeholder="https://webhook.site/your-uuid or https://your-ngrok-url/webhook"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          />
        </div>

        {/* Event type checkboxes */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">
            Event Types
          </label>
          {loadingEvents ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading event types...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedEvents.map(({ provider, label, events: providerEvents }) => (
                <div key={provider} className="rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => toggleGroup(provider)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expandedGroups.has(provider) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {label}
                    <span className="ml-auto text-[10px] opacity-60">
                      {providerEvents.filter((e) => selectedEvents.has(e.type)).length}/{providerEvents.length}
                    </span>
                  </button>
                  {expandedGroups.has(provider) && (
                    <div className="px-3 pb-2 space-y-1 border-t border-border pt-1.5">
                      {providerEvents.map((evt) => (
                        <label
                          key={evt.type}
                          className="flex items-center gap-2 cursor-pointer group"
                        >
                          <input
                            type="checkbox"
                            checked={selectedEvents.has(evt.type)}
                            onChange={() => toggleEvent(evt.type)}
                            className="rounded border-input"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium group-hover:text-foreground transition-colors">
                              {evt.label}
                            </span>
                            <p className="text-[10px] text-muted-foreground font-mono">{evt.type}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setPreviewEventType(evt.type);
                            }}
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                              previewEventType === evt.type
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            Preview
                          </button>
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => selectAllForProvider(provider)}
                        className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
                      >
                        Select all {label}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {registerError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
            <p className="text-xs text-destructive font-mono break-all">{registerError}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleRegisterAndFire()}
          disabled={!url.trim() || selectedEvents.size === 0 || registering}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          {registering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Registering &amp; Firing...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Register &amp; Fire
            </>
          )}
        </button>
      </div>

      {/* Registered endpoint info */}
      {endpoint && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            Endpoint Registered
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">ID</p>
              <p className="text-xs font-mono break-all">{endpoint.id}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">URL</p>
              <p className="text-xs font-mono break-all">{endpoint.url}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Signing Secret</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono break-all text-amber-400">
                  {showSecret ? endpoint.secret : '••••••••••••••••'}
                </code>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(endpoint.secret)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Verify using: <code className="font-mono">HMAC-SHA256(body, secret)</code> — sent as <code className="font-mono">X-Savitura-Signature</code>
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Subscribed Events</p>
              <div className="flex flex-wrap gap-1">
                {endpoint.events.map((evt) => (
                  <span
                    key={evt}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {evt}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fire individual events */}
      {endpoint && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Play className="h-4 w-4" />
            Fire Test Events
          </h2>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedEvents).map((eventType) => {
              const meta = eventTypes.find((e) => e.type === eventType);
              return (
                <button
                  key={eventType}
                  type="button"
                  onClick={() => void handleFireEvent(eventType)}
                  disabled={firing === eventType}
                  className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs hover:border-foreground/30 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {firing === eventType ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  {meta?.label ?? eventType}
                </button>
              );
            })}
          </div>

          {/* Last Result */}
          {lastResult && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
                <StatusBadge status={lastResult.responseStatus} />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lastResult.latencyMs}ms
                </span>
                <span className="text-xs text-muted-foreground font-mono">{lastResult.eventType}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyCurl()}
                  className="ml-auto flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  cURL
                </button>
              </div>
              <div className="p-4 max-h-48 overflow-auto">
                <p className="text-[10px] text-muted-foreground mb-1">Response Body</p>
                <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                  {lastResult.responseBody || '(empty)'}
                </pre>
              </div>
              <div className="border-t border-border px-4 py-2 bg-muted/20">
                <p className="text-[10px] text-muted-foreground">
                  Signature header:{' '}
                  <code className="font-mono">X-Savitura-Signature: t={Date.now()},s={lastResult.signature.slice(0, 16)}...</code>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delivery Log */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Delivery Log
        </h2>

        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deliveries yet. Register an endpoint and fire a test event.
          </p>
        ) : (
          <div className="space-y-2">
            {deliveries.map((delivery) => {
              const isExpanded = expandedDelivery === delivery.id;
              return (
                <div
                  key={delivery.id}
                  className="rounded-md border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedDelivery(isExpanded ? null : delivery.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                  >
                    <StatusBadge status={delivery.responseStatus} />
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {delivery.eventType}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {delivery.latencyMs}ms
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(delivery.createdAt).toLocaleTimeString()}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Response Body</p>
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/20 rounded p-2 max-h-40 overflow-auto">
                          {delivery.responseBody || '(empty)'}
                        </pre>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Signature</p>
                        <code className="text-xs font-mono break-all text-amber-400">
                          {delivery.signature}
                        </code>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Payload</p>
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/20 rounded p-2 max-h-40 overflow-auto">
                          {JSON.stringify(delivery.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sample Payload Preview */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Sample Payload Preview
        </h2>

        <div className="flex flex-wrap gap-2">
          {eventTypes.map((evt) => (
            <button
              key={evt.type}
              type="button"
              onClick={() => setPreviewEventType(evt.type)}
              className={cn(
                'text-[11px] px-2 py-1 rounded border transition-colors',
                previewEventType === evt.type
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50',
              )}
            >
              {evt.label}
            </button>
          ))}
        </div>

        {previewPayload && (
          <div className="relative">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/20 rounded-lg p-4 max-h-96 overflow-auto">
              {JSON.stringify(previewPayload, null, 2)}
            </pre>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(previewPayload, null, 2));
                setPreviewCopied(true);
                setTimeout(() => setPreviewCopied(false), 2000);
              }}
              className="absolute top-2 right-2 flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground bg-background/80 transition-colors"
            >
              {previewCopied ? (
                <CheckCircle className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {previewCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* HMAC Verification Guide */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Verifying Signatures
        </h2>
        <p className="text-xs text-muted-foreground">
          Every webhook request includes an <code className="font-mono">X-Savitura-Signature</code> header with format{' '}
          <code className="font-mono">t=timestamp,s=signature</code>. Verify it using HMAC-SHA256:
        </p>
        <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/20 rounded-lg p-4">
{`// Node.js
const crypto = require('crypto');
const body = JSON.stringify(payload);
const expected = crypto
  .createHmac('sha256', yourSigningSecret)
  .update(body)
  .digest('hex');
const received = signature.split(',')
  .find(p => p.startsWith('s='))
  ?.slice(2);
const isValid = expected === received;`}
        </pre>
      </div>
    </div>
  );
}
