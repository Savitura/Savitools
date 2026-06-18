'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Watch } from './monitor-dashboard';
import { AlertDialog } from './alert-dialog';

interface StellarEvent {
  id: string;
  type: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  from?: string;
  to?: string;
  created_at: string;
  transaction_hash: string;
}

export function LiveFeed({ watch }: { watch?: Watch }) {
  const [events, setEvents] = useState<{ watchId: string; event: StellarEvent }[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  useEffect(() => {
    // Determine websocket URL from API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
    const wsUrl = apiUrl.replace(/\/api$/, ''); // e.g., http://localhost:3001
    
    const socket: Socket = io(wsUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('stellar_event', (data: { watchId: string; event: StellarEvent }) => {
      setEvents(prev => {
        // Prevent duplicates based on event ID
        if (prev.some(e => e.event.id === data.event.id)) {
          return prev;
        }
        return [data, ...prev].slice(0, 100); // keep last 100 events
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!watch) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        </div>
        <h3 className="text-lg font-medium mb-2">No Watch Selected</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Select a watch from the sidebar or add a new one to view real-time Stellar activity.
        </p>
      </div>
    );
  }

  const filteredEvents = paused ? [] : events.filter(e => e.watchId === watch.id);

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-[600px]">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{watch.label || watch.address}</h3>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Connected' : 'Disconnected'} />
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-[300px] mt-1">{watch.address}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setPaused(!paused)}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button 
            onClick={() => setIsAlertOpen(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20"
          >
            Configure Alert
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">Listening for events...</p>
            <p className="text-xs mt-2">Transactions will appear here in real-time.</p>
          </div>
        ) : (
          filteredEvents.map((item) => {
            const ev = item.event;
            return (
              <div key={ev.id} className="p-3 rounded-md border border-border bg-background hover:border-primary/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">{ev.type}</span>
                  <span className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleTimeString()}</span>
                </div>
                {ev.amount && (
                  <p className="text-sm font-medium">
                    {ev.amount} {ev.asset_code || 'XLM'}
                  </p>
                )}
                {ev.from && <p className="text-xs text-muted-foreground mt-1 truncate">From: {ev.from}</p>}
                {ev.to && <p className="text-xs text-muted-foreground truncate">To: {ev.to}</p>}
                <a 
                  href={`https://stellar.expert/explorer/${watch.network}/tx/${ev.transaction_hash}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-[10px] text-blue-500 hover:underline mt-2 inline-block truncate max-w-full"
                >
                  {ev.transaction_hash}
                </a>
              </div>
            );
          })
        )}
      </div>

      {isAlertOpen && (
        <AlertDialog watchId={watch.id} onClose={() => setIsAlertOpen(false)} />
      )}
    </div>
  );
}
