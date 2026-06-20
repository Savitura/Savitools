'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Watch } from './monitor-dashboard';

export function WatchForm({ onAdd }: { onAdd: (watch: Watch) => void }) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'account' | 'contract'>('account');
  const [network, setNetwork] = useState<'testnet' | 'public'>('testnet');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setLoading(true);
    try {
      const newWatch = await apiFetch<Watch>('/monitor/watches', {
        method: 'POST',
        body: JSON.stringify({ address, label, type, network }),
      });
      onAdd(newWatch);
      setAddress('');
      setLabel('');
    } catch (err) {
      console.error(err);
      alert('Failed to add watch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Add Watch</h3>
      
      <div>
        <label className="text-xs text-muted-foreground">Stellar Address / Contract ID</label>
        <input 
          type="text" 
          value={address} 
          onChange={e => setAddress(e.target.value)}
          className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Label (Optional)</label>
        <input 
          type="text" 
          value={label} 
          onChange={e => setLabel(e.target.value)}
          className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select 
            value={type} 
            onChange={e => setType(e.target.value as 'account' | 'contract')}
            className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="account">Account</option>
            <option value="contract">Contract</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Network</label>
          <select 
            value={network} 
            onChange={e => setNetwork(e.target.value as 'testnet' | 'public')}
            className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="testnet">Testnet</option>
            <option value="public">Public</option>
          </select>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={loading || !address}
        className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Adding...' : 'Start Watching'}
      </button>
    </form>
  );
}
