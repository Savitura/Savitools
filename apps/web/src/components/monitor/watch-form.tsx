'use client';

import { useState } from 'react';
import { Federation, StrKey } from '@stellar/stellar-sdk';
import { Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { addRecentItem } from '@/lib/recent-items';
import {
  AlertRuleType,
  NotificationChannel,
  Watch,
  WatchEventType,
} from './monitor-types';

interface DraftRule {
  id: string;
  type: AlertRuleType;
  asset: string;
  threshold: string;
  windowMinutes: string;
  channels: NotificationChannel[];
}

export function WatchForm({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (watch: Watch) => void;
}) {
  const [publicKey, setPublicKey] = useState('');
  const [label, setLabel] = useState('');
  const [network, setNetwork] = useState<'testnet' | 'public'>('testnet');
  const [eventTypes, setEventTypes] = useState<WatchEventType[]>([
    'transaction',
    'payment',
  ]);
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resolveFederation = async () => {
    if (!publicKey.includes('*')) return;
    setLoading(true);
    setError(null);
    try {
      const record = await Federation.Server.resolve(publicKey);
      setPublicKey(record.account_id);
      setEventTypes(['transaction', 'payment']);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Federation lookup failed',
      );
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const isContract = StrKey.isValidContract(publicKey);
      if (!isContract && !StrKey.isValidEd25519PublicKey(publicKey)) {
        throw new Error(
          'Enter a valid Stellar account, contract ID, or federation address',
        );
      }

      const watch = await apiFetch<Watch>('/monitor/watches', {
        method: 'POST',
        body: JSON.stringify({
          publicKey,
          label,
          network,
          eventTypes: isContract
            ? ['contract']
            : eventTypes.filter((type) => type !== 'contract'),
          alertRules: rules.map(({ id: _id, windowMinutes, ...rule }) => ({
            ...rule,
            ...(rule.type === 'transaction_count' && windowMinutes
              ? { windowMinutes: Number(windowMinutes) }
              : {}),
          })),
        }),
      });
      onAdd(watch);
      addRecentItem({
        category: 'monitor',
        title: `Watch: ${label || `${publicKey.slice(0, 8)}…`}`,
        subtitle: `${network} · ${watch.eventTypes.join(', ')}`,
        href: '/monitor',
      });
      setPublicKey('');
      setLabel('');
      setRules([]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Failed to add watch',
      );
    } finally {
      setLoading(false);
    }
  };


  const isContract = StrKey.isValidContract(publicKey);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        className="ml-auto h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add watch</h2>
            <p className="text-sm text-muted-foreground">
              Stream account or contract activity.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <Field label="Account, contract, or federation address">
            <div className="flex gap-2">
              <input
                value={publicKey}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  setPublicKey(value);
                  if (StrKey.isValidContract(value)) {
                    setRules((current) =>
                      current.map((rule) => ({
                        ...rule,
                        type: 'any_activity',
                        asset: '',
                        threshold: '',
                        windowMinutes: '',
                      })),
                    );
                  }
                }}
                placeholder="G..., C..., or name*domain.com"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              />
              {publicKey.includes('*') && (
                <button
                  type="button"
                  onClick={() => void resolveFederation()}
                  className="rounded-md border border-border px-3 text-sm"
                >
                  Resolve
                </button>
              )}
            </div>
          </Field>

          <Field label="Label">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Treasury account"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Network">
            <select
              value={network}
              onChange={(event) =>
                setNetwork(event.target.value as 'testnet' | 'public')
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="testnet">Testnet</option>
              <option value="public">Public</option>
            </select>
          </Field>

          <Field label="Event types">
            <div className="flex flex-wrap gap-3">
              {(isContract ? ['contract'] : ['transaction', 'payment']).map(
                (type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-sm capitalize"
                  >
                    <input
                      type="checkbox"
                      checked={
                        isContract ||
                        eventTypes.includes(type as WatchEventType)
                      }
                      disabled={isContract}
                      onChange={() =>
                        setEventTypes((current) =>
                          current.includes(type as WatchEventType)
                            ? current.filter((item) => item !== type)
                            : [...current, type as WatchEventType],
                        )
                      }
                    />
                    {type}
                  </label>
                ),
              )}
            </div>
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Alert rules</label>
              <button
                type="button"
                onClick={() =>
                  setRules((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      type: 'any_activity',
                      asset: '',
                      threshold: '',
                      windowMinutes: '',
                      channels: ['in_app'],
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Add rule
              </button>
            </div>
            <div className="space-y-3">
              {rules.map((rule) => (
                <RuleEditor
                  key={rule.id}
                  rule={rule}
                  contract={isContract}
                  onChange={(next) =>
                    setRules((current) =>
                      current.map((item) =>
                        item.id === next.id ? next : item,
                      ),
                    )
                  }
                  onDelete={() =>
                    setRules((current) =>
                      current.filter((item) => item.id !== rule.id),
                    )
                  }
                />
              ))}
              {rules.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Events will be recorded without firing alerts.
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || (!isContract && eventTypes.length === 0)}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Start watching'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RuleEditor({
  rule,
  contract,
  onChange,
  onDelete,
}: {
  rule: DraftRule;
  contract: boolean;
  onChange: (rule: DraftRule) => void;
  onDelete: () => void;
}) {
  const isCount = rule.type === 'transaction_count';
  const isBalance =
    rule.type === 'balance_above' || rule.type === 'balance_below';
  const needsThreshold =
    isCount ||
    isBalance ||
    rule.type === 'amount_received_gte' ||
    rule.type === 'amount_sent_gte';
  const needsAsset = rule.type === 'asset_received';
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="flex gap-2">
        <select
          value={rule.type}
          onChange={(event) =>
            onChange({ ...rule, type: event.target.value as AlertRuleType })
          }
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="any_activity">Any activity</option>
          {!contract && (
            <option value="amount_received_gte">
              Amount received at least
            </option>
          )}
          {!contract && (
            <option value="amount_sent_gte">Amount sent at least</option>
          )}
          {!contract && <option value="asset_received">Asset received</option>}
          {!contract && <option value="tx_failed">Transaction failed</option>}
          {!contract && <option value="balance_above">Balance above</option>}
          {!contract && <option value="balance_below">Balance below</option>}
          {!contract && (
            <option value="transaction_count">Transaction count reaches</option>
          )}
        </select>
        <button type="button" onClick={onDelete} aria-label="Remove rule">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      {needsThreshold && (
        <input
          value={rule.threshold}
          onChange={(event) =>
            onChange({ ...rule, threshold: event.target.value })
          }
          placeholder={isCount ? 'Transaction count' : 'Threshold amount'}
          inputMode={isCount ? 'numeric' : 'decimal'}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          required
        />
      )}
      {isCount && (
        <input
          value={rule.windowMinutes}
          onChange={(event) =>
            onChange({ ...rule, windowMinutes: event.target.value })
          }
          placeholder="Window in minutes (default 60)"
          inputMode="numeric"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      )}
      {isBalance && (
        <input
          value={rule.asset}
          onChange={(event) => onChange({ ...rule, asset: event.target.value })}
          placeholder="Asset, defaults to XLM"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      )}
      {needsAsset && (
        <input
          value={rule.asset}
          onChange={(event) => onChange({ ...rule, asset: event.target.value })}
          placeholder="XLM or CODE:ISSUER"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          required
        />
      )}
      <div className="flex flex-wrap gap-3">
        {(['in_app', 'email', 'webhook'] as NotificationChannel[]).map(
          (channel) => (
            <label
              key={channel}
              className="flex items-center gap-1.5 text-xs capitalize"
            >
              <input
                type="checkbox"
                checked={rule.channels.includes(channel)}
                onChange={() =>
                  onChange({
                    ...rule,
                    channels: rule.channels.includes(channel)
                      ? rule.channels.length === 1
                        ? rule.channels
                        : rule.channels.filter((item) => item !== channel)
                      : [...rule.channels, channel],
                  })
                }
              />
              {channel.replace('_', ' ')}
            </label>
          ),
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
