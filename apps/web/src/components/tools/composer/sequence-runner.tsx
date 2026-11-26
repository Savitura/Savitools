'use client';

import { useState } from 'react';
import { buildTransaction, simulateTransaction } from '@/lib/composer-api';
import type { ComposedOperation } from './composer-types';

export function SequenceRunner({
  operations,
  clearOperations,
  sourceAccount,
  memo,
  network,
}: {
  operations: ComposedOperation[];
  clearOperations: () => void;
  sourceAccount: string;
  memo: string;
  network: string;
}) {
  const [steps, setSteps] = useState<ComposedOperation[][]>([]);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [results, setResults] = useState<
    Array<{ step: number; hash?: string; status: string; next?: string }>
  >([]);
  const [running, setRunning] = useState(false);

  const addStep = () => {
    if (operations.length === 0) return;
    setSteps((previous) => [...previous, operations]);
    clearOperations();
  };

  const removeStep = (index: number) => {
    setSteps((previous) => previous.filter((_, stepIndex) => stepIndex !== index));
  };

  const run = async () => {
    const allSteps = steps.length > 0 ? steps : operations.length > 0 ? [operations] : [];
    if (allSteps.length === 0) return;

    setRunning(true);
    setResults([]);
    let currentSource = sourceAccount;

    for (let index = 0; index < allSteps.length; index++) {
      const stepOperations = allSteps[index];
      try {
        const apiNetwork: 'testnet' | 'mainnet' =
          network === 'mainnet' ? 'mainnet' : 'testnet';
        const payload = {
          sourceAccount: currentSource.trim(),
          memo: memo.trim() || undefined,
          operations: stepOperations.map((operation) => ({
            type: operation.type,
            ...operation.fields,
          })),
          network: apiNetwork,
        };
        const built = await buildTransaction(payload);
        const simulation = await simulateTransaction({
          xdr: built.xdr,
          network: apiNetwork,
        });
        const status = simulation.success ? 'success' : 'failed';
        setResults((previous) => [
          ...previous,
          {
            step: index + 1,
            hash: simulation.hash ?? undefined,
            status,
          },
        ]);
        if (stopOnFailure && !simulation.success) break;
      } catch {
        setResults((previous) => [
          ...previous,
          { step: index + 1, status: 'error', next: undefined },
        ]);
        if (stopOnFailure) break;
      }
    }
    setRunning(false);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <h2 className="text-lg font-semibold">Transaction Sequence</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Build multiple transactions that run in order with automatic sequence numbers.
      </p>

      {steps.length === 0 && operations.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">
          No steps yet. Use the builder to compose an operation set, then click &quot;Add
          Step&quot;.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 mb-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex items-center justify-between bg-background/50 rounded-lg px-3 py-2"
          >
            <span className="text-xs font-medium">
              Step {index + 1}: {step.length} op(s)
            </span>
            <button
              onClick={() => removeStep(index)}
              className="text-xs text-rose-400 hover:text-rose-300"
            >
              Remove
            </button>
          </div>
        ))}
        {operations.length > 0 && (
          <button
            onClick={addStep}
            className="text-xs bg-secondary rounded-lg px-3 py-2 hover:bg-secondary/80"
          >
            Add current ops as Step {steps.length + 1}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={stopOnFailure}
          onChange={(event) => setStopOnFailure(event.target.checked)}
          className="rounded border-border"
        />
        Stop on failure
      </label>

      <button
        onClick={() => void run()}
        disabled={running || (steps.length === 0 && operations.length === 0)}
        className="mt-3 bg-violet-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? 'Running…' : 'Run Sequence'}
      </button>

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((result, index) => (
            <div
              key={index}
              className="text-xs bg-background/50 rounded-lg px-3 py-2 flex justify-between"
            >
              <span>Step {result.step}</span>
              <span>Status: {result.status}</span>
              <span className="font-mono">{result.hash ?? result.next ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
