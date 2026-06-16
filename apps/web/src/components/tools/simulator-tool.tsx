'use client';

import { ToolEmptyState } from '@/components/tools/tool-empty-state';
import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import { EXAMPLE_USDC_ISSUER } from '@/lib/examples';
import { markStepComplete } from '@/lib/onboarding';
import { ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface RoutePreview {
  source: string;
  destination: string;
  hops: string[];
  estimatedFee: string;
}

export function SimulatorTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [route, setRoute] = useState<RoutePreview | null>(null);

  useExampleOnboarding('simulate');

  useEffect(() => {
    const src = searchParams.get('source');
    const dest = searchParams.get('destination');
    if (src && dest && searchParams.get('example') === '1') {
      setSource(src === 'native' ? 'XLM' : src);
      setDestination(dest);
      setRoute({
        source: src === 'native' ? 'XLM (native)' : src,
        destination: `USDC:${EXAMPLE_USDC_ISSUER.slice(0, 8)}…`,
        hops: ['XLM', 'USDC'],
        estimatedFee: '0.00001 XLM',
      });
    }
  }, [searchParams]);

  const runSimulation = (src: string, dest: string) => {
    setSource(src);
    setDestination(dest);
    setRoute({
      source: src,
      destination: dest === 'USDC' ? `USDC (${EXAMPLE_USDC_ISSUER.slice(0, 8)}…)` : dest,
      hops: [src, dest],
      estimatedFee: '0.00001 XLM',
    });
    markStepComplete('simulate');
    router.replace(
      `/simulator?source=${src === 'XLM' ? 'native' : src}&destination=${dest}&example=1`,
    );
  };

  const loadExample = () => runSimulation('XLM', 'USDC');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (source.trim() && destination.trim()) {
      runSimulation(source.trim(), destination.trim());
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-6">
        <input
          type="text"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setRoute(null);
          }}
          placeholder="Source asset (e.g. XLM)"
          className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <ArrowRight className="h-4 w-4 self-center text-muted-foreground hidden sm:block" />
        <input
          type="text"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setRoute(null);
          }}
          placeholder="Destination asset (e.g. USDC)"
          className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!source.trim() || !destination.trim()}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          Simulate
        </button>
      </form>

      {!route ? (
        <ToolEmptyState
          message="Enter a source and destination asset to find payment routes"
          exampleLabel="Try XLM → USDC"
          onExample={loadExample}
        />
      ) : (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <p className="text-sm font-medium">Route preview</p>
          <div className="flex items-center gap-2 text-sm font-mono">
            <span>{route.source}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>{route.destination}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Hops</p>
            <p className="text-sm">{route.hops.join(' → ')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Estimated fee</p>
            <p className="text-sm font-mono">{route.estimatedFee}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Path finding will connect to Horizon — implementation in progress.
          </p>
        </div>
      )}
    </div>
  );
}
