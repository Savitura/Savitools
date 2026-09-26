'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Plus, Trash2, Loader2, Wifi, WifiOff } from 'lucide-react';
import { API_ORIGIN, apiFetch } from '@/lib/api';
import { AlertPanel } from './alert-dialog';
import { LiveFeed } from './live-feed';
import { AlertEvent, Watch, WatchEvent } from './monitor-types';
import { WatchForm } from './watch-form';
import {
  MonitorWatchesSkeleton,
  MonitorNoWatchesState,
  ErrorState,
} from '../tools/state-display';

type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function MonitorDashboard() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [watchesLoading, setWatchesLoading] = useState(true);
  const [watchesError, setWatchesError] = useState<string | null>(null);
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liveEvents, setLiveEvents] = useState<WatchEvent[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<AlertEvent[]>([]);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);

  const loadWatches = async () => {
    setWatchesLoading(true);
    setWatchesError(null);
    try {
      const items = await apiFetch<Watch[]>('/monitor/watches');
      setWatches(items);
      setActiveWatchId((current) => current ?? items[0]?.id ?? null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load watches';
      setWatchesError(message);
      setWatches([]);
    } finally {
      setWatchesLoading(false);
    }
  };

  useEffect(() => {
    void loadWatches();
  }, []);

  useEffect(() => {
    const socket: Socket = io(API_ORIGIN, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    setSocketStatus('connecting');
    setSocketError(null);

    socket.on('connect', () => {
      setSocketStatus('connected');
      setSocketError(null);
    });

    socket.on('disconnect', (reason) => {
      setSocketStatus('disconnected');
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        setSocketError(`Stream disconnected: ${reason}`);
      }
    });

    socket.on('connect_error', (err) => {
      setSocketStatus('error');
      setSocketError(err.message || 'Failed to establish live stream connection');
    });

    socket.on(
      'watch_event',
      ({ watchId, event }: { watchId: string; event: WatchEvent }) => {
        setLiveEvents((current) =>
          current.some((item) => item.id === event.id)
            ? current
            : [{ ...event, watchId }, ...current].slice(0, 500),
        );
        setWatches((current) =>
          current.map((watch) =>
            watch.id === watchId
              ? { ...watch, lastEventAt: event.occurredAt }
              : watch,
          ),
        );
      },
    );
    socket.on(
      'watch_status',
      (
        status: Pick<Watch, 'streamMode' | 'status' | 'lastError'> & {
          watchId: string;
        },
      ) => {
        setWatches((current) =>
          current.map((watch) =>
            watch.id === status.watchId ? { ...watch, ...status } : watch,
          ),
        );
      },
    );
    socket.on('alert_event', ({ alert }: { alert: AlertEvent }) =>
      setLiveAlerts((current) =>
        [alert, ...current.filter((item) => item.id !== alert.id)].slice(
          0,
          500,
        ),
      ),
    );
    socket.on('alert_status', ({ alert }: { alert: AlertEvent }) =>
      setLiveAlerts((current) =>
        [alert, ...current.filter((item) => item.id !== alert.id)].slice(
          0,
          500,
        ),
      ),
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  const reconnectSocket = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const activeWatch = useMemo(
    () => watches.find((watch) => watch.id === activeWatchId),
    [activeWatchId, watches],
  );

  const addWatch = (watch: Watch) => {
    setWatches((current) => [...current, watch]);
    setActiveWatchId(watch.id);
    setDrawerOpen(false);
  };

  const deleteWatch = async (watch: Watch) => {
    await apiFetch<void>(`/monitor/watches/${watch.id}`, { method: 'DELETE' });
    setWatches((current) => current.filter((item) => item.id !== watch.id));
    setActiveWatchId((current) => {
      if (current !== watch.id) return current;
      return watches.find((item) => item.id !== watch.id)?.id ?? null;
    });
  };

  return (
    <div className="space-y-3">
      {/* Stream connection status bar */}
      <div
        className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
          socketStatus === 'connected'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : socketStatus === 'connecting'
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-rose-500/30 bg-rose-500/5'
        }`}
      >
        <div className="flex items-center gap-2">
          {socketStatus === 'connected' ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          ) : socketStatus === 'connecting' ? (
            <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" aria-hidden="true" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
          )}
          <span
            className={`font-medium ${
              socketStatus === 'connected'
                ? 'text-emerald-600'
                : socketStatus === 'connecting'
                  ? 'text-amber-600'
                  : 'text-rose-600'
            }`}
          >
            {socketStatus === 'connected'
              ? 'Live stream connected'
              : socketStatus === 'connecting'
                ? 'Connecting to event stream…'
                : socketStatus === 'disconnected'
                  ? 'Stream disconnected'
                  : 'Stream error'}
          </span>
          {socketError && (
            <span className="text-muted-foreground/70 truncate max-w-xs">
              — {socketError}
            </span>
          )}
        </div>
        {socketStatus !== 'connected' && (
          <button
            type="button"
            onClick={reconnectSocket}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
          >
            <Loader2 className="h-3 w-3" aria-hidden="true" />
            Reconnect
          </button>
        )}
      </div>

      <div className="flex min-h-[680px] w-full overflow-hidden rounded-xl border border-border bg-card">
        <aside className="w-full max-w-xs border-r border-border bg-muted/20 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Ledger watches</h2>
              <p className="text-xs text-muted-foreground">
                {watchesLoading
                  ? 'Loading…'
                  : watchesError
                    ? 'Load failed'
                    : `${watches.length} active`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-md bg-primary p-2 text-primary-foreground"
              aria-label="Add watch"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {watchesLoading ? (
              <MonitorWatchesSkeleton />
            ) : watchesError ? (
              <ErrorState
                title="Failed to load watches"
                message={watchesError}
                onRetry={loadWatches}
                retryLabel="Reload"
                details={watchesError}
              />
            ) : watches.length > 0 ? (
              watches.map((watch) => (
                <div
                  key={watch.id}
                  onClick={() => setActiveWatchId(watch.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ')
                      setActiveWatchId(watch.id);
                  }}
                  role="button"
                  tabIndex={0}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    watch.id === activeWatchId
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {watch.label || 'Unnamed watch'}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {truncateKey(watch.publicKey)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteWatch(watch);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${watch.label || watch.publicKey}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <StatusBadge watch={watch} />
                    <span className="text-muted-foreground">
                      {watch.lastEventAt
                        ? relativeTime(watch.lastEventAt)
                        : 'No events'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <MonitorNoWatchesState onCreate={() => setDrawerOpen(true)} />
            )}
          </div>
        </aside>

        <main className="grid min-w-0 flex-1 grid-rows-[minmax(0,1fr)_260px]">
          <LiveFeed
            watch={activeWatch}
            liveEvents={liveEvents.filter(
              (event) => event.watchId === activeWatchId,
            )}
          />
          <AlertPanel
            watch={activeWatch}
            liveAlerts={liveAlerts.filter(
              (alert) => alert.watchId === activeWatchId,
            )}
          />
        </main>

        <WatchForm
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onAdd={addWatch}
        />
      </div>
    </div>
  );
}

function StatusBadge({ watch }: { watch: Watch }) {
  const color =
    watch.status === 'streaming'
      ? 'bg-emerald-500'
      : watch.status === 'polling'
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <span
      className="inline-flex items-center gap-1.5 capitalize"
      title={watch.lastError ?? undefined}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {watch.status}
    </span>
  );
}

function truncateKey(value: string): string {
  return value.length > 18
    ? `${value.slice(0, 8)}...${value.slice(-6)}`
    : value;
}

function relativeTime(value: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1_000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}
