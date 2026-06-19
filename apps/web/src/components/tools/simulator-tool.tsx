'use client';

import { useState } from 'react';
import { ArrowRight, Loader2, RefreshCw, Network, Shuffle, ArrowLeftRight, Info } from 'lucide-react';
import {
  simulateStrictSend,
  simulateStrictReceive,
  simulateFee,
  type SimulatePathResult,
  type SimulateStrictSendResult,
  type SimulateStrictReceiveResult,
  type SimulateFeeResult,
} from '@/lib/api';

type Mode = 'strict_send' | 'strict_receive';

interface FormState {
  sourceAsset: string;
  sourceAmount: string;
  destAsset: string;
  destAmount: string;
  network: 'testnet' | 'mainnet';
  mode: Mode;
}

export function SimulatorTool() {
  const [form, setForm] = useState<FormState>({
    sourceAsset: 'XLM',
    sourceAmount: '100',
    destAsset: 'USDC',
    destAmount: '50',
    network: 'testnet',
    mode: 'strict_send',
  });
  const [loading, setLoading] = useState(false);
  const [feeLoading, setFeeLoading] = useState(false);
  const [result, setResult] = useState<SimulateStrictSendResult | SimulateStrictReceiveResult | null>(null);
  const [feeResult, setFeeResult] = useState<SimulateFeeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setResult(null);
    setError(null);
  };

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (form.mode === 'strict_send') {
        const res = await simulateStrictSend({
          sourceAsset: form.sourceAsset,
          sourceAmount: form.sourceAmount,
          destAsset: form.destAsset,
          network: form.network,
        });
        setResult(res);
      } else {
        const res = await simulateStrictReceive({
          sourceAsset: form.sourceAsset,
          destAmount: form.destAmount,
          destAsset: form.destAsset,
          network: form.network,
        });
        setResult(res);
      }
      const fee = await simulateFee(1, form.network);
      setFeeResult(fee);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const swapAssets = () => {
    setForm((prev) => ({
      ...prev,
      sourceAsset: prev.destAsset,
      destAsset: prev.sourceAsset,
    }));
    setResult(null);
    setError(null);
  };

  const isBestPath = (idx: number) => {
    if (!result) return false;
    if (result.mode === 'strict_send') {
      const r = result as SimulateStrictSendResult;
      return r.bestPath && r.paths[idx] === r.bestPath;
    }
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Mode toggle */}
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => updateForm('mode', 'strict_send')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                form.mode === 'strict_send'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Strict Send
            </button>
            <button
              type="button"
              onClick={() => updateForm('mode', 'strict_receive')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                form.mode === 'strict_receive'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Strict Receive
            </button>
          </div>

          {/* Network toggle */}
          <div className="flex items-center gap-2 text-sm">
            <Network className="h-4 w-4 text-muted-foreground" />
            <button
              type="button"
              onClick={() => updateForm('network', form.network === 'testnet' ? 'mainnet' : 'testnet')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                form.network === 'testnet'
                  ? 'bg-green-600 text-white'
                  : 'bg-purple-600 text-white'
              }`}
            >
              {form.network === 'testnet' ? 'Testnet' : 'Mainnet'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-muted-foreground mb-1">Source Asset</label>
            <input
              type="text"
              value={form.sourceAsset}
              onChange={(e) => updateForm('sourceAsset', e.target.value)}
              placeholder="XLM or CODE:ISSUER"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>

          {form.mode === 'strict_send' ? (
            <div className="w-[140px]">
              <label className="block text-xs text-muted-foreground mb-1">Source Amount</label>
              <input
                type="text"
                value={form.sourceAmount}
                onChange={(e) => updateForm('sourceAmount', e.target.value)}
                placeholder="100"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          ) : (
            <div className="w-[140px]">
              <label className="block text-xs text-muted-foreground mb-1">Dest Amount</label>
              <input
                type="text"
                value={form.destAmount}
                onChange={(e) => updateForm('destAmount', e.target.value)}
                placeholder="50"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          <button
            type="button"
            onClick={swapAssets}
            className="p-2 rounded-md border border-border hover:bg-muted transition-colors"
            title="Swap assets"
          >
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-muted-foreground mb-1">Destination Asset</label>
            <input
              type="text"
              value={form.destAsset}
              onChange={(e) => updateForm('destAsset', e.target.value)}
              placeholder="USDC or CODE:ISSUER"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>

          <button
            type="button"
            onClick={handleSimulate}
            disabled={loading || !form.sourceAsset || !form.destAsset || (form.mode === 'strict_send' && !form.sourceAmount) || (form.mode === 'strict_receive' && !form.destAmount)}
            className="px-5 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Finding paths...
              </>
            ) : (
              <>
                <Shuffle className="h-4 w-4" />
                Simulate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Route Visualization */}
          {renderRouteVisualization(result, form.mode)}

          {/* Best Path Details */}
          {renderBestPathDetails(result, form)}

          {/* Fee Info */}
          {feeResult && renderFeeInfo(feeResult)}
        </div>
      )}
    </div>
  );
}

function AssetBox({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 text-center min-w-[100px] shadow-sm">
      <div className="text-sm font-semibold font-mono">{label}</div>
      {subtitle && (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
          {subtitle}
        </div>
      )}
    </div>
  );
}

function HopArrow({ rate }: { rate?: string }) {
  return (
    <div className="flex flex-col items-center mx-1">
      <ArrowRight className="h-5 w-5 text-muted-foreground" />
      {rate && <span className="text-[10px] text-muted-foreground mt-0.5">{rate}</span>}
    </div>
  );
}

function renderRouteVisualization(result: SimulateStrictSendResult | SimulateStrictReceiveResult, mode: Mode) {
  const paths = result.paths;
  if (!paths || paths.length === 0) return null;

  const bestPath = mode === 'strict_send'
    ? (result as SimulateStrictSendResult).bestPath
    : (result as SimulateStrictReceiveResult).bestPath;

  if (!bestPath) return null;

  const sourceAsset = mode === 'strict_send'
    ? (result as SimulateStrictSendResult).sourceAsset
    : (result as SimulateStrictReceiveResult).sourceAsset;

  const destAsset = mode === 'strict_send'
    ? (result as SimulateStrictSendResult).destAsset
    : (result as SimulateStrictReceiveResult).destAsset;

  const sourceLabel = sourceAsset;
  const destLabel = destAsset;

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5" />
        Route Visualization — Best Path
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <AssetBox label={sourceLabel} />
        {bestPath.path.length === 0 ? (
          <HopArrow rate={bestPath.exchangeRate ? parseFloat(bestPath.exchangeRate).toFixed(6) : undefined} />
        ) : (
          bestPath.path.map((hop, i) => (
            <div key={i} className="flex items-center gap-1">
              <HopArrow />
              <AssetBox
                label={hop.assetCode || hop.assetType}
                subtitle={hop.assetIssuer ? `${hop.assetIssuer.slice(0, 8)}...` : undefined}
              />
            </div>
          ))
        )}
        {bestPath.path.length > 0 && (
          <HopArrow rate={bestPath.exchangeRate ? parseFloat(bestPath.exchangeRate).toFixed(6) : undefined} />
        )}
        <AssetBox label={destLabel} />
      </div>
    </div>
  );
}

function AmountBadge({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-border p-3 ${className || ''}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function renderBestPathDetails(result: SimulateStrictSendResult | SimulateStrictReceiveResult, form: FormState) {
  const { mode } = form;
  const paths = result.paths;
  const totalPaths = result.totalPathsFound;

  if (mode === 'strict_send') {
    const r = result as SimulateStrictSendResult;
    const best = r.bestPath;
    if (!best) return null;

    return (
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">Best Path Summary</h3>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {totalPaths} path{totalPaths !== 1 ? 's' : ''} found
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AmountBadge label="You Send" value={`${best.sourceAmount} ${r.sourceAsset}`} />
          <AmountBadge label="You Receive" value={`${best.destinationAmount} ${r.destAsset}`} />
          <AmountBadge label="Exchange Rate" value={`1 ${r.sourceAsset} ≈ ${parseFloat(best.exchangeRate).toFixed(7)} ${r.destAsset}`} />
          <AmountBadge label="Slippage" value={`${r.slippagePercent}%`} />
        </div>

        {best.path.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Path Hops</div>
            <div className="flex flex-wrap gap-2">
              {best.path.map((hop, i) => (
                <span key={i} className="text-xs font-mono bg-muted px-2 py-1 rounded-md">
                  {hop.assetCode || hop.assetType}
                  {hop.assetIssuer && (
                    <span className="text-muted-foreground ml-1">:{hop.assetIssuer.slice(0, 8)}...</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* All paths comparison */}
        {paths.length > 1 && (
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">All Paths Comparison</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">#</th>
                    <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Path</th>
                    <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">You Receive</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {paths.map((p, i) => (
                    <tr key={i} className={`border-b border-border/50 ${isBestPathHelper(result, i, mode) ? 'bg-green-500/5' : ''}`}>
                      <td className="py-1.5 pr-3 font-mono">{i + 1}</td>
                      <td className="py-1.5 pr-3 font-mono">
                        {r.sourceAsset}
                        {p.path.map((hop) => ` → ${hop.assetCode || hop.assetType}`)}
                        {` → ${r.destAsset}`}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono">{parseFloat(p.destinationAmount).toFixed(4)}</td>
                      <td className="py-1.5 text-right font-mono">{parseFloat(p.exchangeRate).toFixed(7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Strict receive
  const r = result as SimulateStrictReceiveResult;
  const best = r.bestPath;
  if (!best) return null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Best Path Summary</h3>
        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {totalPaths} path{totalPaths !== 1 ? 's' : ''} found
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AmountBadge label="You Send" value={`${best.sourceAmount} ${r.sourceAsset}`} />
        <AmountBadge label="You Receive" value={`${r.destAmount} ${r.destAsset}`} />
        <AmountBadge label="Exchange Rate" value={`1 ${r.sourceAsset} ≈ ${parseFloat(best.exchangeRate).toFixed(7)} ${r.destAsset}`} />
        <AmountBadge label="Slippage" value={`${r.slippagePercent}%`} />
      </div>

      {best.path.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Path Hops</div>
          <div className="flex flex-wrap gap-2">
            {best.path.map((hop, i) => (
              <span key={i} className="text-xs font-mono bg-muted px-2 py-1 rounded-md">
                {hop.assetCode || hop.assetType}
                {hop.assetIssuer && (
                  <span className="text-muted-foreground ml-1">:{hop.assetIssuer.slice(0, 8)}...</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {paths.length > 1 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">All Paths Comparison</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Path</th>
                  <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">You Send</th>
                  <th className="text-right py-1.5 text-muted-foreground font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {paths.map((p, i) => (
                  <tr key={i} className={`border-b border-border/50 ${isBestPathHelper(result, i, mode) ? 'bg-green-500/5' : ''}`}>
                    <td className="py-1.5 pr-3 font-mono">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {r.sourceAsset}
                      {p.path.map((hop) => ` → ${hop.assetCode || hop.assetType}`)}
                      {` → ${r.destAsset}`}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">{parseFloat(p.sourceAmount).toFixed(4)}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(p.exchangeRate).toFixed(7)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function isBestPathHelper(result: SimulateStrictSendResult | SimulateStrictReceiveResult, idx: number, mode: Mode) {
  const paths = result.paths;
  if (!paths || idx >= paths.length) return false;
  if (mode === 'strict_send') {
    const r = result as SimulateStrictSendResult;
    return r.bestPath === paths[idx];
  }
  const r = result as SimulateStrictReceiveResult;
  return r.bestPath === paths[idx];
}

function renderFeeInfo(fee: SimulateFeeResult) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        Network Fee Estimate
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AmountBadge label={`Base Fee (${fee.network})`} value={`${fee.baseFeeStroops} stroops`} />
        <AmountBadge label={`Operations`} value={`${fee.operations}`} />
        <AmountBadge label="Total Fee" value={`${fee.totalFeeStroops} stroops`} />
        <AmountBadge label="Total (XLM)" value={`${fee.totalFeeXlm} XLM`} />
      </div>
      <div className="mt-3 text-[10px] text-muted-foreground">
        Fee percentiles — p10: {fee.feeChargedPercentiles.p10} | p50: {fee.feeChargedPercentiles.p50} | p90: {fee.feeChargedPercentiles.p90} | p99: {fee.feeChargedPercentiles.p99}
      </div>
    </div>
  );
}
