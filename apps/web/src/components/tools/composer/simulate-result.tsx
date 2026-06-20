'use client';

import { SimulateTransactionResult } from '@/lib/composer-api';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface SimulateResultProps {
  result: SimulateTransactionResult | null;
  loading: boolean;
  error: string | null;
}

export function SimulateResult({ result, loading, error }: SimulateResultProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border/60 bg-card/40">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
        <span className="text-xs text-muted-foreground">Simulating on Horizon…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/5">
        <AlertTriangle className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
        <p className="text-xs text-rose-300">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        result.success
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-rose-500/30 bg-rose-500/5'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {result.success ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-rose-400" />
        )}
        <span className={`text-xs font-semibold ${result.success ? 'text-emerald-300' : 'text-rose-300'}`}>
          {result.success ? 'Simulation succeeded' : 'Simulation failed'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {result.fee && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Fee charged</span>
            <span className="text-xs font-mono text-foreground">{result.fee} stroops</span>
          </div>
        )}
        {result.resultCodes && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Tx result code</span>
            <span className="text-xs font-mono text-rose-300">{result.resultCodes}</span>
          </div>
        )}
        {result.hash && (
          <div className="flex flex-col gap-0.5 col-span-full">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Hash</span>
            <span className="text-[10px] font-mono text-foreground/70 break-all">{result.hash}</span>
          </div>
        )}
      </div>

      {result.operationResults && result.operationResults.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            Operation results
          </p>
          <div className="flex flex-col gap-1">
            {result.operationResults.map((code, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">op[{i}]</span>
                <span className={`text-[10px] font-mono ${code.includes('success') ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
