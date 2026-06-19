'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  Send,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  generateKeypair as apiGenerateKeypair,
  fundFromFriendbot,
  getBalances,
  sendPayment,
  type GenerateKeypairResult,
  type Balance,
} from '@/lib/api';

interface SandboxWallet extends GenerateKeypairResult {
  id: string;
  label: string;
  createdAt: number;
}

interface WalletWithState extends SandboxWallet {
  balances: Balance[];
  loadingBalances: boolean;
  revealed: boolean;
  funding: boolean;
}

const STORAGE_KEY = 'savitools:sandbox:wallets';

function loadWallets(): SandboxWallet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWallets(wallets: SandboxWallet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

function expandWallet(w: SandboxWallet, overrides: Partial<WalletWithState> = {}): WalletWithState {
  return {
    ...w,
    balances: [],
    loadingBalances: false,
    revealed: false,
    funding: false,
    ...overrides,
  };
}

export function SandboxTool() {
  const [wallets, setWallets] = useState<SandboxWallet[]>([]);
  const [expanded, setExpanded] = useState<Record<string, WalletWithState>>({});
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sendingWalletId, setSendingWalletId] = useState<string | null>(null);
  const [sendForm, setSendForm] = useState<Record<string, { destination: string; asset: string; amount: string }>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadWallets();
    setWallets(stored);
    const expandedMap: Record<string, WalletWithState> = {};
    for (const w of stored) {
      expandedMap[w.id] = expandWallet(w);
    }
    setExpanded(expandedMap);
  }, []);

  const persistAndRefresh = useCallback((newWallets: SandboxWallet[]) => {
    setWallets(newWallets);
    saveWallets(newWallets);
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const kp = await apiGenerateKeypair();
      const wallet: SandboxWallet = {
        id: crypto.randomUUID(),
        label: `Wallet ${wallets.length + 1}`,
        publicKey: kp.publicKey,
        secretKey: kp.secretKey,
        createdAt: Date.now(),
      };
      const newWallets = [wallet, ...wallets];
      persistAndRefresh(newWallets);
      setExpanded((prev) => ({
        ...prev,
        [wallet.id]: expandWallet(wallet),
      }));
    } catch (err) {
      console.error('Failed to create wallet:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    const newWallets = wallets.filter((w) => w.id !== id);
    persistAndRefresh(newWallets);
    setExpanded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleFund = async (wallet: WalletWithState) => {
    setExpanded((prev) => ({
      ...prev,
      [wallet.id]: { ...prev[wallet.id], funding: true },
    }));
    try {
      await fundFromFriendbot(wallet.publicKey);
      await handleRefreshBalances(wallet.id);
    } catch (err) {
      console.error('Funding failed:', err);
    } finally {
      setExpanded((prev) => ({
        ...prev,
        [wallet.id]: { ...prev[wallet.id], funding: false },
      }));
    }
  };

  const handleRefreshBalances = async (id: string) => {
    const wallet = wallets.find((w) => w.id === id);
    if (!wallet) return;
    setExpanded((prev) => ({
      ...prev,
      [id]: { ...prev[id], loadingBalances: true },
    }));
    try {
      const result = await getBalances(wallet.publicKey);
      setExpanded((prev) => ({
        ...prev,
        [id]: { ...prev[id], balances: result.balances, loadingBalances: false },
      }));
    } catch {
      setExpanded((prev) => ({
        ...prev,
        [id]: { ...prev[id], balances: [], loadingBalances: false },
      }));
    }
  };

  const toggleReveal = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: { ...prev[id], revealed: !prev[id]?.revealed },
    }));
  };

  const handleSend = async (wallet: WalletWithState) => {
    const form = sendForm[wallet.id];
    if (!form || !form.destination || !form.asset || !form.amount) return;

    setSendingWalletId(wallet.id);
    setSendError(null);
    setSendResult(null);

    try {
      const result = await sendPayment(wallet.secretKey, form.destination, form.asset, form.amount);
      setSendResult(`Sent ${result.amount} ${result.asset} → ${result.destination.slice(0, 8)}... (tx: ${result.txHash.slice(0, 16)}...)`);
      await handleRefreshBalances(wallet.id);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSendingWalletId(null);
    }
  };

  const updateSendForm = (id: string, field: string, value: string) => {
    setSendForm((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { destination: '', asset: 'XLM', amount: '' }), [field]: value },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          <strong>Testnet only.</strong> These wallets use the Stellar test network. Keys are stored
          in your browser's localStorage — never use real funds or mainnet keys here.
        </p>
      </div>

      {/* Create wallet button */}
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
      >
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating keypair...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Create Wallet
          </>
        )}
      </button>

      {/* Wallet list */}
      {wallets.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No wallets yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {wallets.map((w) => {
            const state = expanded[w.id] || expandWallet(w);
            const form = sendForm[w.id] || { destination: '', asset: 'XLM', amount: '' };
            return (
              <div key={w.id} className="rounded-lg border border-border p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{w.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(w.id)}
                    className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>

                {/* Public key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Public Key</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(w.publicKey, `pub-${w.id}`)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedKey === `pub-${w.id}` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedKey === `pub-${w.id}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs font-mono break-all bg-muted/50 px-2 py-1.5 rounded">
                    {w.publicKey}
                  </p>
                </div>

                {/* Secret key (hidden by default) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Secret Key</span>
                    <button
                      type="button"
                      onClick={() => toggleReveal(w.id)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {state.revealed ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                      {state.revealed ? 'Hide' : 'Reveal'}
                    </button>
                  </div>
                  <p className="text-xs font-mono break-all bg-muted/50 px-2 py-1.5 rounded">
                    {state.revealed ? (
                      <>
                        {w.secretKey}
                        <button
                          type="button"
                          onClick={() => handleCopy(w.secretKey, `sec-${w.id}`)}
                          className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {copiedKey === `sec-${w.id}` ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-muted-foreground/50">••••••••••••••••••••••••••••••</span>
                    )}
                  </p>
                </div>

                {/* Fund + Refresh Balances */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleFund(state)}
                    disabled={state.funding}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {state.funding ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    {state.funding ? 'Funding...' : 'Fund via Friendbot'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRefreshBalances(w.id)}
                    disabled={state.loadingBalances}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3 w-3 ${state.loadingBalances ? 'animate-spin' : ''}`} />
                    Balances
                  </button>
                </div>

                {/* Balances */}
                {state.balances.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                      Balances
                    </span>
                    <div className="space-y-1">
                      {state.balances.map((b, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs font-mono bg-muted/30 px-2 py-1 rounded"
                        >
                          <span>
                            {b.assetCode || b.assetType === 'native' ? 'XLM' : b.assetType}
                            {b.assetIssuer && (
                              <span className="text-muted-foreground ml-1">
                                :{b.assetIssuer.slice(0, 8)}...
                              </span>
                            )}
                          </span>
                          <span>{parseFloat(b.balance).toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Send payment */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                    <Send className="h-3 w-3" />
                    Send payment
                  </summary>
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={form.destination}
                      onChange={(e) => updateSendForm(w.id, 'destination', e.target.value)}
                      placeholder="Destination public key"
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
                    />
                    <div className="flex gap-2">
                      <select
                        value={form.asset}
                        onChange={(e) => updateSendForm(w.id, 'asset', e.target.value)}
                        className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
                      >
                        <option value="XLM">XLM</option>
                        {state.balances
                          .filter((b) => b.assetCode)
                          .map((b, i) => (
                            <option key={i} value={`${b.assetCode}:${b.assetIssuer}`}>
                              {b.assetCode}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={form.amount}
                        onChange={(e) => updateSendForm(w.id, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="w-24 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend(state)}
                      disabled={sendingWalletId === w.id || !form.destination || !form.amount}
                      className="w-full px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      {sendingWalletId === w.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" />
                          Send
                        </>
                      )}
                    </button>
                    {sendError && sendingWalletId !== w.id && (
                      <p className="text-[10px] text-red-500">{sendError}</p>
                    )}
                    {sendResult && sendingWalletId !== w.id && (
                      <p className="text-[10px] text-green-600">{sendResult}</p>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
