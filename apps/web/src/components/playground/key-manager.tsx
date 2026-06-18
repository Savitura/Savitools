'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  KeyRound,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import {
  listPlaygroundApiKeys,
  savePlaygroundApiKey,
  deletePlaygroundApiKey,
  type PlaygroundApiKey,
  type PlaygroundProvider,
} from '@/lib/api';

interface KeyManagerProps {
  provider: PlaygroundProvider;
  className?: string;
}

export function KeyManager({ provider, className }: KeyManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [keys, setKeys] = useState<PlaygroundApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listPlaygroundApiKeys();
      setKeys(all.filter((k) => k.provider === provider));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (isOpen) {
      void fetchKeys();
    }
  }, [isOpen, fetchKeys]);

  const handleSave = async () => {
    if (!newLabel.trim() || !newKey.trim()) return;
    setSaving(true);
    try {
      await savePlaygroundApiKey(provider, newLabel.trim(), newKey.trim());
      setNewLabel('');
      setNewKey('');
      setShowForm(false);
      await fetchKeys();
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deletePlaygroundApiKey(id);
    await fetchKeys();
  };

  const providerLabel = provider === 'fluxa' ? 'Fluxa' : 'CrowdPay';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] transition-colors',
          keys.length > 0
            ? 'border-emerald-500/30 text-emerald-400'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <KeyRound className="h-3 w-3" />
        {keys.length > 0 ? `${keys.length} key${keys.length > 1 ? 's' : ''}` : 'Add API key'}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-xs font-medium">{providerLabel} API Keys</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : keys.length === 0 && !showForm ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No keys stored yet. Add one to use the proxy.
              </p>
            ) : (
              keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-2 rounded border border-border px-2.5 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{key.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {showKey[key.id] ? key.maskedKey : '••••••••••••'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => ({ ...prev, [key.id]: !prev[key.id] }))}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {showKey[key.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(key.id)}
                    className="text-muted-foreground hover:text-red-400 shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}

            {showForm && (
              <div className="space-y-2 rounded border border-primary/30 bg-primary/5 p-2.5">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Key label (e.g. Test Key)"
                  className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs"
                />
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder={`Paste your ${providerLabel} API key`}
                  className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setNewLabel('');
                      setNewKey('');
                    }}
                    className="flex-1 rounded border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !newLabel.trim() || !newKey.trim()}
                    className="flex-1 rounded bg-primary text-primary-foreground px-2 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Key'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {!showForm && (
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add new key
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
