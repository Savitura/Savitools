'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export function AlertDialog({ watchId, onClose }: { watchId: string; onClose: () => void }) {
  const [conditionType, setConditionType] = useState('payment_received');
  const [threshold, setThreshold] = useState('');
  const [channel, setChannel] = useState<'email' | 'webhook'>('email');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination) return;
    
    setLoading(true);
    try {
      await apiFetch(`/monitor/watches/${watchId}/alerts`, {
        method: 'POST',
        body: JSON.stringify({ conditionType, threshold, channel, destination }),
      });
      alert('Alert configuration saved!');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to save alert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Configure Alert</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Event Type</label>
            <select 
              value={conditionType} 
              onChange={e => setConditionType(e.target.value)}
              className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
            >
              <option value="payment_received">Payment Received</option>
              <option value="contract_invoked">Contract Invoked</option>
              <option value="trustline_created">Trustline Created</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Threshold Amount (Optional)</label>
            <input 
              type="number" 
              step="any"
              value={threshold} 
              onChange={e => setThreshold(e.target.value)}
              placeholder="e.g. 100"
              className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">Leave empty to alert on all events</p>
          </div>

          <div>
            <label className="text-sm font-medium">Notification Channel</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="radio" 
                  name="channel" 
                  value="email" 
                  checked={channel === 'email'} 
                  onChange={() => setChannel('email')} 
                />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="radio" 
                  name="channel" 
                  value="webhook" 
                  checked={channel === 'webhook'} 
                  onChange={() => setChannel('webhook')} 
                />
                Webhook
              </label>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Destination</label>
            <input 
              type={channel === 'email' ? 'email' : 'url'} 
              value={destination} 
              onChange={e => setDestination(e.target.value)}
              placeholder={channel === 'email' ? 'your@email.com' : 'https://api.yoursite.com/webhook'}
              className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !destination}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
