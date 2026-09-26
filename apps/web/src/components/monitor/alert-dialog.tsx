'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Webhook } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AlertEvent, Paginated, Watch } from './monitor-types';

export function AlertPanel({
  watch,
  liveAlerts,
}: {
  watch?: Watch;
  liveAlerts: AlertEvent[];
}) {
  const [history, setHistory] = useState<AlertEvent[]>([]);
  const [webhookOpen, setWebhookOpen] = useState(false);

  useEffect(() => {
    if (!watch) {
      setHistory([]);
      return;
    }
    void apiFetch<Paginated<AlertEvent>>(
      `/monitor/watches/${watch.id}/alerts?limit=50`,
    ).then((page) => setHistory(page.items));
  }, [watch]);

  const alerts = useMemo(() => {
    const byId = new Map<string, AlertEvent>();
    [...liveAlerts, ...history].forEach((alert) => byId.set(alert.id, alert));
    return Array.from(byId.values()).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
  }, [history, liveAlerts]);

  if (!watch) return <div className="border-t border-border" />;

  const resend = async (alert: AlertEvent) => {
    const updated = await apiFetch<AlertEvent>(
      `/monitor/watches/${watch.id}/alerts/${alert.id}/resend`,
      { method: 'POST' },
    );
    setHistory((current) => [
      updated,
      ...current.filter((item) => item.id !== updated.id),
    ]);
  };

  return (
    <section className="relative z-[60] min-h-0 overflow-y-auto bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Fired alerts</h3>
          <p className="text-xs text-muted-foreground">
            Payload and delivery status
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWebhookOpen((current) => !current)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs"
        >
          <Webhook className="h-3.5 w-3.5" /> Webhook
        </button>
      </div>

      {webhookOpen && <WebhookForm onSaved={() => setWebhookOpen(false)} />}

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <Status status={alert.deliveryStatus} />
                <time className="text-[11px] text-muted-foreground">
                  {new Date(alert.createdAt).toLocaleString()}
                </time>
              </div>
              <pre className="max-h-16 overflow-hidden whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                {JSON.stringify(alert.payload, null, 2)}
              </pre>
            </div>
            <button
              type="button"
              onClick={() => void resend(alert)}
              className="inline-flex items-center gap-1 text-xs text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-send
            </button>
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            No alert rules have fired for this watch.
          </p>
        )}
      </div>
    </section>
  );
}

function WebhookForm({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiFetch('/monitor/webhook', {
        method: 'POST',
        body: JSON.stringify({ url, secret }),
      });
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Failed to save webhook',
      );
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mb-3 grid gap-2 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_auto]"
    >
      <input
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://example.com/hooks/stellar"
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        required
      />
      <input
        type="password"
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
        placeholder="HMAC secret, at least 16 characters"
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        minLength={16}
        required
      />
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
      >
        Save
      </button>
      {error && (
        <p className="text-xs text-destructive md:col-span-3">{error}</p>
      )}
    </form>
  );
}

function Status({ status }: { status: AlertEvent['deliveryStatus'] }) {
  const color =
    status === 'delivered'
      ? 'bg-emerald-500/15 text-emerald-600'
      : status === 'failed'
        ? 'bg-red-500/15 text-red-600'
        : 'bg-amber-500/15 text-amber-600';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${color}`}
    >
      {status}
    </span>
  );
}
