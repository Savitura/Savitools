'use client';

import {
  decodeXdr,
  getAccountTransactions,
  inspectTransaction,
  type TransactionBreakdown,
  type TxSummary,
} from '@/lib/api';
import { useNetwork } from '@/lib/network-context';
import { markStepComplete } from '@/lib/onboarding';
import { EXAMPLE_TX_HASH } from '@/lib/examples';
import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  XCircle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ToolEmptyState } from './tool-empty-state';

// ─── Input type detection ─────────────────────────────────────────────────

type InputType = 'hash' | 'address' | 'xdr' | 'unknown';

function detectInputType(value: string): InputType {
  const v = value.trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return 'hash';
  if (/^G[A-Z2-7]{55}$/.test(v)) return 'address';
  // XDR is base64 and typically long
  if (v.length > 80 && /^[A-Za-z0-9+/=]+$/.test(v)) return 'xdr';
  return 'unknown';
}

// ─── Utility ──────────────────────────────────────────────────────────────

function shortKey(key: string) {
  if (!key || key.length < 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, []);
  return { copied, copy };
}

// ─── Shared primitives ────────────────────────────────────────────────────

function Badge({ success }: { success: boolean }) {
  return success ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-400/10 rounded px-1.5 py-0.5">
      <CheckCircle className="h-3 w-3" /> success
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 rounded px-1.5 py-0.5">
      <XCircle className="h-3 w-3" /> failed
    </span>
  );
}

function CopyButton({ text, id, copied, copy }: { text: string; id: string; copied: string | null; copy: (t: string, id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => copy(text, id)}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied === id ? <CheckCircle className="h-3 w-3 text-green-400 inline" /> : <Copy className="h-3 w-3 inline" />}
    </button>
  );
}

function Field({ label, value, copyId, copied, copy }: { label: string; value: string | null | undefined; copyId?: string; copied?: string | null; copy?: (t: string, id: string) => void }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 py-1 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-xs break-all">
        {value}
        {copyId && copy && <CopyButton text={value} id={copyId} copied={copied ?? null} copy={copy} />}
      </span>
    </div>
  );
}

// ─── Operation card ───────────────────────────────────────────────────────

function OperationCard({ op, index, copied, copy }: {
  op: TransactionBreakdown['operations'][number];
  index: number;
  copied: string | null;
  copy: (t: string, id: string) => void;
}) {
  const [effectsOpen, setEffectsOpen] = useState(false);
  const hasEffects = op.effects.length > 0;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono bg-muted rounded px-1.5 py-0.5">#{index + 1}</span>
          <span className="text-sm font-medium">{op.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {op.resultCode && op.resultCode !== 'op_success' && (
            <span className="font-mono text-xs text-red-400 bg-red-400/10 rounded px-1.5 py-0.5">{op.resultCode}</span>
          )}
          <Badge success={op.success} />
        </div>
      </div>

      {op.resultExplanation && !op.success && (
        <div className="flex items-start gap-2 mb-3 text-xs text-amber-400 bg-amber-400/10 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {op.resultExplanation}
        </div>
      )}

      <div className="space-y-0.5">
        {op.sourceAccount && (
          <Field label="source" value={shortKey(op.sourceAccount)} copyId={`op-src-${index}`} copied={copied} copy={copy} />
        )}
        {Object.entries(op.fields).map(([key, val]) =>
          val ? <Field key={key} label={key} value={val} copyId={`${index}-${key}`} copied={copied} copy={copy} /> : null
        )}
      </div>

      {hasEffects && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setEffectsOpen((v) => !v)}
          >
            {effectsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {op.effects.length} ledger effect{op.effects.length !== 1 ? 's' : ''}
          </button>
          {effectsOpen && (
            <div className="mt-2 space-y-1">
              {op.effects.map((eff, ei) => (
                <div key={ei} className="text-xs font-mono bg-muted/40 rounded px-2 py-1">
                  <span className="text-foreground/70">{eff.type}</span>
                  {' '}
                  <span className="text-muted-foreground">{shortKey(eff.account)}</span>
                  {Object.entries(eff)
                    .filter(([k]) => !['type', 'account'].includes(k) && eff[k] != null)
                    .map(([k, v]) => (
                      <span key={k} className="ml-2 text-muted-foreground">{k}={String(v)}</span>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Transaction breakdown view ───────────────────────────────────────────

function TxBreakdown({ data, onInspectInComposer }: {
  data: TransactionBreakdown;
  onInspectInComposer: () => void;
}) {
  const { copied, copy } = useCopy();
  const [rawOpen, setRawOpen] = useState(false);

  const horizonUrl = data.network === 'mainnet'
    ? `https://horizon.stellar.org/transactions/${data.hash}`
    : `https://horizon-testnet.stellar.org/transactions/${data.hash}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge success={data.success} />
              {!data.success && (
                <span className="font-mono text-xs text-red-400 bg-red-400/10 rounded px-1.5 py-0.5">{data.resultCode}</span>
              )}
            </div>
            {!data.success && (
              <p className="text-xs text-amber-400 mt-1">{data.resultExplanation}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data.composerPayload && (
              <button
                type="button"
                onClick={onInspectInComposer}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:border-foreground/30 transition-colors"
              >
                Inspect in Composer
              </button>
            )}
            {data.ledger > 0 && (
              <a
                href={horizonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Horizon <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="space-y-0.5">
          <Field label="hash" value={data.hash} copyId="hash" copied={copied} copy={copy} />
          <Field label="source account" value={data.sourceAccount} copyId="src" copied={copied} copy={copy} />
          {data.ledger > 0 && <Field label="ledger" value={String(data.ledger)} />}
          {data.createdAt && <Field label="created at" value={new Date(data.createdAt).toLocaleString()} />}
          <Field label="sequence" value={data.sequenceNumber} />
          <Field label="fee charged" value={data.feeCharged ? `${(parseInt(data.feeCharged) / 1e7).toFixed(7)} XLM` : null} />
          <Field label="max fee" value={data.maxFee ? `${(parseInt(data.maxFee) / 1e7).toFixed(7)} XLM` : null} />
          {data.memo && <Field label={`memo (${data.memoType})`} value={data.memo} />}
          {data.timeBounds && (
            <>
              {data.timeBounds.minTime && <Field label="valid after" value={new Date(parseInt(data.timeBounds.minTime) * 1000).toLocaleString()} />}
              {data.timeBounds.maxTime && <Field label="valid before" value={new Date(parseInt(data.timeBounds.maxTime) * 1000).toLocaleString()} />}
            </>
          )}
        </div>
      </div>

      {/* Operations */}
      <div>
        <h3 className="text-sm font-medium mb-3">
          Operations <span className="text-muted-foreground font-normal">({data.operationCount})</span>
        </h3>
        <div className="space-y-3">
          {data.operations.map((op) => (
            <OperationCard key={op.index} op={op} index={op.index} copied={copied} copy={copy} />
          ))}
        </div>
      </div>

      {/* Raw JSON toggle */}
      {data.rawJson && (
        <div>
          <button
            type="button"
            onClick={() => setRawOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Code2 className="h-3.5 w-3.5" />
            {rawOpen ? 'Hide' : 'Show'} raw Horizon JSON
          </button>
          {rawOpen && (
            <pre className="mt-2 p-4 rounded-lg border border-border bg-muted/30 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(data.rawJson, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Account timeline view ────────────────────────────────────────────────

function AccountTimeline({ txs, onSelect }: { txs: TxSummary[]; onSelect: (hash: string) => void }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-medium">Recent Transactions <span className="text-muted-foreground font-normal">({txs.length})</span></h3>
      </div>
      <div className="divide-y divide-border">
        {txs.map((tx) => (
          <button
            key={tx.hash}
            type="button"
            onClick={() => onSelect(tx.hash)}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
          >
            <div className="shrink-0">
              {tx.success
                ? <CheckCircle className="h-4 w-4 text-green-400" />
                : <XCircle className="h-4 w-4 text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-foreground truncate">{tx.hash}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(tx.createdAt).toLocaleString()} · {tx.operationCount} op{tx.operationCount !== 1 ? 's' : ''} · {tx.feeCharged ? `${(parseInt(tx.feeCharged) / 1e7).toFixed(5)} XLM fee` : ''}
              </div>
            </div>
            {!tx.success && (
              <span className="shrink-0 font-mono text-xs text-red-400">{tx.resultCode}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function InspectorTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { network } = useNetwork();

  const initialInput = searchParams.get('hash') ?? searchParams.get('address') ?? searchParams.get('xdr') ?? '';

  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txData, setTxData] = useState<TransactionBreakdown | null>(null);
  const [accountTxs, setAccountTxs] = useState<TxSummary[] | null>(null);
  const [inputType, setInputType] = useState<InputType>(() => detectInputType(initialInput));

  useExampleOnboarding('inspect');

  // Submit on mount if there's an initial value
  useEffect(() => {
    if (initialInput) void runInspect(initialInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runInspect = async (value: string) => {
    const v = value.trim();
    if (!v) return;

    const type = detectInputType(v);
    setInputType(type);
    setLoading(true);
    setError(null);
    setTxData(null);
    setAccountTxs(null);

    try {
      if (type === 'hash') {
        const data = await inspectTransaction(v, network);
        setTxData(data);
        markStepComplete('inspect');
      } else if (type === 'address') {
        const txs = await getAccountTransactions(v, network);
        setAccountTxs(txs);
        markStepComplete('inspect');
      } else if (type === 'xdr') {
        const data = await decodeXdr(v, network);
        setTxData(data);
        markStepComplete('inspect');
      } else {
        setError('Unrecognised input. Paste a 64-char hex transaction hash, a Stellar public key (G…), or a base64 XDR string.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runInspect(input);
  };

  const handleAccountTxSelect = (hash: string) => {
    setInput(hash);
    router.replace(`/inspector?hash=${hash}`);
    void runInspect(hash);
  };

  const handleInspectInComposer = () => {
    if (!txData?.composerPayload) return;
    const encoded = encodeURIComponent(JSON.stringify(txData.composerPayload));
    router.push(`/composer?payload=${encoded}`);
  };

  const loadExample = () => {
    setInput(EXAMPLE_TX_HASH);
    router.replace(`/inspector?hash=${EXAMPLE_TX_HASH}`);
    void runInspect(EXAMPLE_TX_HASH);
  };

  const inputTypeLabel = input.trim()
    ? { hash: 'Transaction hash', address: 'Stellar address', xdr: 'XDR envelope', unknown: '' }[detectInputType(input.trim())]
    : '';

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setTxData(null);
              setAccountTxs(null);
              setError(null);
            }}
            placeholder="Transaction hash, Stellar address (G…), or raw XDR"
            className="w-full rounded-md border border-border bg-background pl-9 pr-4 py-2 text-sm font-mono"
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Inspect'}
        </button>
      </form>

      {input.trim() && inputTypeLabel && !loading && (
        <p className="text-xs text-muted-foreground mb-4 -mt-3">
          Detected: <span className="text-foreground">{inputTypeLabel}</span> · network: <span className="text-foreground">{network}</span>
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 mb-6 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && !txData && !accountTxs && (
        <ToolEmptyState
          message="Paste a transaction hash, Stellar address, or raw XDR to get a full human-readable breakdown."
          exampleLabel="Try example transaction"
          onExample={loadExample}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">
            {inputType === 'address' ? 'Loading account transactions…' : 'Fetching and decoding transaction…'}
          </span>
        </div>
      )}

      {txData && !loading && (
        <TxBreakdown data={txData} onInspectInComposer={handleInspectInComposer} />
      )}

      {accountTxs && !loading && (
        <AccountTimeline txs={accountTxs} onSelect={handleAccountTxSelect} />
      )}
    </div>
  );
}
