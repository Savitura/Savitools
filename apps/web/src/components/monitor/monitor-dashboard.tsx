'use client';

import { useState, useEffect } from 'react';
import { WatchForm } from './watch-form';
import { LiveFeed } from './live-feed';
import { apiFetch } from '@/lib/api';

export interface Watch {
  id: string;
  address: string;
  type: 'account' | 'contract';
  label: string;
  network: 'testnet' | 'public';
}

export function MonitorDashboard() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Watch[]>('/monitor/watches')
      .then(data => {
        if (Array.isArray(data)) {
          setWatches(data);
          if (data.length > 0) setActiveWatchId(data[0].id);
        }
      })
      .catch(err => console.error('Failed to load watches', err));
  }, []);

  const handleAddWatch = (watch: Watch) => {
    setWatches([...watches, watch]);
    setActiveWatchId(watch.id);
  };

  const activeWatch = watches.find(w => w.id === activeWatchId);

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <WatchForm onAdd={handleAddWatch} />
        
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">Active Watches</h3>
          {watches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active watches.</p>
          ) : (
            <ul className="space-y-2">
              {watches.map(w => (
                <li 
                  key={w.id} 
                  className={`p-3 rounded-md border cursor-pointer transition-colors ${activeWatchId === w.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  onClick={() => setActiveWatchId(w.id)}
                >
                  <p className="text-sm font-medium">{w.label || 'Unnamed'}</p>
                  <p className="text-xs font-mono text-muted-foreground truncate">{w.address}</p>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 block">{w.network} • {w.type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      
      <div className="w-full lg:w-2/3">
        <LiveFeed watch={activeWatch} />
      </div>
    </div>
  );
}
