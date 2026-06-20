'use client';

import {
  buildTransaction,
  fetchOperations,
  OperationManifestEntry,
  simulateTransaction,
  SimulateTransactionResult,
  submitToHorizon,
} from '@/lib/composer-api';
import { useNetwork } from '@/lib/network-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ComposerToolbar } from './composer-toolbar';
import { OperationForm } from './operation-form';
import { OperationList } from './operation-list';
import { OperationPalette } from './operation-palette';
import { SimulateResult } from './simulate-result';
import { XdrPreview } from './xdr-preview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposedOperation {
  id: string;
  type: string;
  fields: Record<string, unknown>;
}

let opCounter = 0;
function newId() {
  return `op-${++opCounter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Source account input
// ---------------------------------------------------------------------------

function SourceAccountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="source-account-input"
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        Source Account <span className="text-rose-400">*</span>
      </label>
      <input
        id="source-account-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="G… (public key of the transaction source account)"
        className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Composer component
// ---------------------------------------------------------------------------

export function ComposerTool() {
  const { network } = useNetwork();

  // Remote manifest
  const [manifest, setManifest] = useState<OperationManifestEntry[]>([]);
  const [manifestLoading, setManifestLoading] = useState(true);

  // Composer state
  const [sourceAccount, setSourceAccount] = useState('');
  const [memo, setMemo] = useState('');
  const [operations, setOperations] = useState<ComposedOperation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // XDR
  const [xdr, setXdr] = useState<string | null>(null);
  const [xdrBuilding, setXdrBuilding] = useState(false);
  const buildDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simulate
  const [simResult, setSimResult] = useState<SimulateTransactionResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Submit
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    hash?: string;
    error?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Load manifest once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchOperations()
      .then(setManifest)
      .catch(() => {
        // Fallback: manifest still loads but is empty — user sees empty palette
      })
      .finally(() => setManifestLoading(false));
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-build XDR whenever ops / source / memo / network change
  // ---------------------------------------------------------------------------
  const triggerBuild = useCallback(
    (ops: ComposedOperation[], src: string, m: string, net: typeof network) => {
      if (buildDebounce.current) clearTimeout(buildDebounce.current);
      if (!src || ops.length === 0) {
        setXdr(null);
        return;
      }
      setXdrBuilding(true);
      buildDebounce.current = setTimeout(async () => {
        try {
          const result = await buildTransaction({
            sourceAccount: src,
            network: net,
            memo: m || undefined,
            operations: ops.map((op) => ({ type: op.type, ...op.fields })),
          });
          setXdr(result.xdr);
        } catch {
          setXdr(null);
        } finally {
          setXdrBuilding(false);
        }
      }, 600);
    },
    [],
  );

  useEffect(() => {
    triggerBuild(operations, sourceAccount, memo, network);
    setSimResult(null);
    setSubmitResult(null);
  }, [operations, sourceAccount, memo, network, triggerBuild]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAdd = (type: string) => {
    const op: ComposedOperation = { id: newId(), type, fields: {} };
    setOperations((prev) => [...prev, op]);
    setSelectedId(op.id);
  };

  const handleRemove = (id: string) => {
    setOperations((prev) => prev.filter((o) => o.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const handleReorder = (reordered: ComposedOperation[]) => {
    setOperations(reordered);
  };

  const handleFieldChange = (id: string, fields: Record<string, unknown>) => {
    setOperations((prev) =>
      prev.map((op) => (op.id === id ? { ...op, fields } : op)),
    );
  };

  const handleSimulate = async () => {
    if (!xdr) return;
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);
    try {
      const result = await simulateTransaction({ xdr, network });
      setSimResult(result);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : 'Simulation error');
    } finally {
      setSimLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!xdr) return;
    setSubmitting(true);
    setSubmitResult(null);
    const result = await submitToHorizon(xdr, network);
    setSubmitResult(result);
    setSubmitting(false);
  };

  const selected = operations.find((o) => o.id === selectedId) ?? null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <ComposerToolbar
        xdr={xdr}
        opCount={operations.length}
        onSimulate={handleSimulate}
        onSubmit={handleSubmit}
        simulating={simLoading}
        submitting={submitting}
        submitResult={submitResult}
      />

      {/* Source account */}
      <SourceAccountInput value={sourceAccount} onChange={setSourceAccount} />

      {/* Optional memo */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="memo-input"
          className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Memo <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
        </label>
        <input
          id="memo-input"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Transaction memo text"
          maxLength={28}
          className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
        />
      </div>

      {/* 3-column composer area */}
      <div className="grid grid-cols-[200px_1fr_280px] gap-4 min-h-[400px]">
        {/* Left — palette */}
        <div className="rounded-xl border border-border/60 bg-card/30 p-3 overflow-hidden">
          {manifestLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-card/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <OperationPalette operations={manifest} onAdd={handleAdd} />
          )}
        </div>

        {/* Center — op list */}
        <div className="rounded-xl border border-border/60 bg-card/30 p-4 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Transaction ({operations.length} op{operations.length !== 1 ? 's' : ''})
          </p>
          <OperationList
            operations={operations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={handleRemove}
            onReorder={handleReorder}
          />
        </div>

        {/* Right — form */}
        <div className="rounded-xl border border-border/60 bg-card/30 p-4 overflow-y-auto">
          <OperationForm
            operation={selected}
            manifest={manifest}
            onChange={handleFieldChange}
          />
        </div>
      </div>

      {/* XDR preview */}
      <XdrPreview xdr={xdr} loading={xdrBuilding} />

      {/* Simulate result */}
      <SimulateResult result={simResult} loading={simLoading} error={simError} />
    </div>
  );
}
