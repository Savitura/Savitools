'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  ExternalLink,
  FileCode2,
  Pause,
  Play,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { apiFetch, downloadCsv } from '@/lib/api';
import { Paginated, Watch, WatchEvent } from './monitor-types';
import {
  MonitorFeedSkeleton,
  MonitorNoWatchSelectedState,
  MonitorNoEventsState,
  ErrorState,
} from '../tools/state-display';

export function LiveFeed({
  watch,
  liveEvents,
}: {
  watch?: Watch;
  liveEvents: WatchEvent[];
}) {
  const [history, setHistory] = useState<WatchEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);

  const handleExportCsv = async () => {
    if (!watch) return;
    setExporting(true);
    setExportError(null);
    try {
      // Same filters as the on-screen feed (watch + search query), capped at
      // the server's 10,000-row export limit (see Savitura/Savitools#147).
      const params = new URLSearchParams({
        watchId: watch.id,
        limit: '10000',
      });
      if (query.trim()) params.set('q', query.trim());
      await downloadCsv(
        `/monitor/search/export?${params.toString()}`,
        `monitor-${watch.publicKey.slice(0, 8)}.csv`,
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const loadHistory = useCallback(async (watchId: string, q = '') => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const trimmed = q.trim();
      // With a query, use the search endpoint so the feed and the CSV export
      // share the same filters (see Savitura/Savitools#147).
      const page = trimmed
        ? await apiFetch<Paginated<WatchEvent>>(
            `/monitor/search?watchId=${encodeURIComponent(watchId)}&q=${encodeURIComponent(trimmed)}&limit=100`,
          )
        : await apiFetch<Paginated<WatchEvent>>(
            `/monitor/watches/${watchId}/events?limit=100`,
          );
      setHistory(page.items);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load event history';
      setHistoryError(message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!watch) {
      setHistory([]);
      setHistoryError(null);
      return;
    }
    void loadHistory(watch.id, query);
  }, [watch, query, loadHistory]);

  const events = useMemo(() => {
    const byId = new Map<string, WatchEvent>();
    [...liveEvents, ...history].forEach((event) => byId.set(event.id, event));
    return Array.from(byId.values()).sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
  }, [history, liveEvents]);

  useEffect(() => {
    if (!paused && feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [events.length, paused]);

  if (!watch) {
    return <MonitorNoWatchSelectedState />;
  }

  return (
    <section className="flex min-h-0 flex-col border-b border-border">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {watch.label || watch.publicKey}
            </h3>
            <ConnectionDot watch={watch} />
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {watch.publicKey}
          </p>
          {watch.lastError && watch.status === 'error' && (
            <p className="mt-1 truncate text-xs text-red-500">
              {watch.lastError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events…"
              aria-label="Search events by hash, account, or asset"
              className="w-40 rounded-md border border-border bg-background py-1.5 pl-6 pr-6 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {exportError && (
            <span className="text-[11px] text-red-500" title={exportError}>
              Export failed
            </span>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            title="Download event history as CSV (up to 10,000 rows)"
          >
            {exporting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {historyError && (
            <button
              type="button"
              onClick={() => loadHistory(watch.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Reload history"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaused((current) => !current)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs"
          >
            {paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            {paused ? 'Resume scroll' : 'Pause scroll'}
          </button>
        </div>
      </header>

      <div
        ref={feedRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
      >
        {historyLoading ? (
          <MonitorFeedSkeleton />
        ) : historyError ? (
          <ErrorState
            title="Failed to load event history"
            message={historyError}
            onRetry={() => loadHistory(watch.id)}
            retryLabel="Reload history"
            details={historyError}
          />
        ) : events.length > 0 ? (
          events.map((event) => (
            <EventCard key={event.id} event={event} watch={watch} />
          ))
        ) : query.trim() ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            No events match “{query.trim()}”. Try a different hash, account, or asset.
          </p>
        ) : (
          <MonitorNoEventsState
            watchLabel={watch.label || watch.publicKey.slice(0, 8) + '…' + watch.publicKey.slice(-6)}
            eventTypes={watch.eventTypes}
          />
        )}
      </div>
    </section>
  );
}

function EventCard({ event, watch }: { event: WatchEvent; watch: Watch }) {
  const payload = event.payload;
  const amount = text(payload.amount);
  const assetType = text(payload.asset_type);
  const assetCode = text(payload.asset_code);
  const asset = assetType === 'native' ? 'XLM' : assetCode;
  const from = text(payload.from ?? payload.source_account);
  const to = text(payload.to ?? payload.account);
  const transactionHash = text(
    payload.transaction_hash ?? payload.hash ?? payload.transactionHash,
  );
  const Icon =
    event.eventType === 'contract'
      ? FileCode2
      : to === watch.publicKey
        ? ArrowDownLeft
        : from === watch.publicKey
          ? ArrowUpRight
          : Activity;

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide">
              {event.eventType}
            </p>
            {amount && (
              <p className="text-sm font-medium">
                {amount} {asset || ''}
              </p>
            )}
            {from && (
              <p className="truncate text-xs text-muted-foreground">
                From {from}
              </p>
            )}
            {to && (
              <p className="truncate text-xs text-muted-foreground">To {to}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <time className="block text-[11px] text-muted-foreground">
            {new Date(event.occurredAt).toLocaleString()}
          </time>
          {transactionHash && (
            <a
              href={`https://stellar.expert/explorer/${watch.network}/tx/${transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary"
            >
              Stellar Expert <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function ConnectionDot({ watch }: { watch: Watch }) {
  const color =
    watch.status === 'streaming'
      ? 'bg-emerald-500'
      : watch.status === 'polling'
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      title={watch.lastError ?? `${watch.status} via ${watch.streamMode}`}
    />
  );
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}
