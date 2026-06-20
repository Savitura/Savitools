'use client';

import { useNetwork } from '@/lib/network-context';
import { ExternalLink, Loader2, SendHorizontal, Zap } from 'lucide-react';

interface ComposerToolbarProps {
  xdr: string | null;
  opCount: number;
  onSimulate: () => void;
  onSubmit: () => void;
  simulating: boolean;
  submitting: boolean;
  submitResult: { success: boolean; hash?: string; error?: string } | null;
}

export function ComposerToolbar({
  xdr,
  opCount,
  onSimulate,
  onSubmit,
  simulating,
  submitting,
  submitResult,
}: ComposerToolbarProps) {
  const { network, setNetwork } = useNetwork();

  const horizonExplorerBase =
    network === 'mainnet'
      ? 'https://stellar.expert/explorer/public/tx'
      : 'https://stellar.expert/explorer/testnet/tx';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Network toggle */}
      <div className="flex items-center rounded-lg border border-border/60 bg-card/60 p-0.5 gap-0.5">
        {(['testnet', 'mainnet'] as const).map((n) => (
          <button
            key={n}
            id={`network-toggle-${n}`}
            onClick={() => setNetwork(n)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              network === n
                ? n === 'mainnet'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Op count badge */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-card/40 text-xs text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">{opCount}</span>
        <span>op{opCount !== 1 ? 's' : ''}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Simulate */}
        <button
          id="simulate-btn"
          onClick={onSimulate}
          disabled={!xdr || simulating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 transition-all"
        >
          {simulating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Simulate
        </button>

        {/* Submit */}
        <button
          id="submit-to-horizon-btn"
          onClick={onSubmit}
          disabled={!xdr || submitting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-all"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SendHorizontal className="h-3.5 w-3.5" />
          )}
          Submit to Horizon
        </button>
      </div>

      {/* Submit result inline */}
      {submitResult && (
        <div className="w-full">
          {submitResult.success && submitResult.hash ? (
            <a
              href={`${horizonExplorerBase}/${submitResult.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              id="submit-success-link"
              className="flex items-center gap-1.5 text-[10px] text-emerald-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Submitted! View on Stellar Expert → {submitResult.hash.slice(0, 16)}…
            </a>
          ) : (
            <p className="text-[10px] text-rose-400">{submitResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
