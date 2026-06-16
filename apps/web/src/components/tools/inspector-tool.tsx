'use client';

import { ToolEmptyState } from '@/components/tools/tool-empty-state';
import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import { EXAMPLE_TX_HASH } from '@/lib/examples';
import { markStepComplete } from '@/lib/onboarding';
import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function InspectorTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialHash = searchParams.get('hash') ?? '';
  const [input, setInput] = useState(initialHash);
  const [submitted, setSubmitted] = useState(!!initialHash);

  useExampleOnboarding('inspect');

  useEffect(() => {
    if (initialHash) {
      setInput(initialHash);
      setSubmitted(true);
    }
  }, [initialHash]);

  const loadExample = () => {
    setInput(EXAMPLE_TX_HASH);
    setSubmitted(true);
    markStepComplete('inspect');
    router.replace(`/inspector?hash=${EXAMPLE_TX_HASH}&example=1`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) setSubmitted(true);
  };

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
              setSubmitted(false);
            }}
            placeholder="Transaction hash, Stellar address, or XDR"
            className="w-full rounded-md border border-border bg-background pl-9 pr-4 py-2 text-sm font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          Inspect
        </button>
      </form>

      {!submitted ? (
        <ToolEmptyState
          message="Paste a transaction hash, Stellar address, or XDR to start"
          exampleLabel="Try example transaction"
          onExample={loadExample}
        />
      ) : (
        <div className="rounded-lg border border-border p-6">
          <p className="text-xs text-muted-foreground mb-2 font-mono">{input}</p>
          <p className="text-sm text-muted-foreground">
            Transaction decoding will connect to Horizon — implementation in progress.
          </p>
        </div>
      )}
    </div>
  );
}
