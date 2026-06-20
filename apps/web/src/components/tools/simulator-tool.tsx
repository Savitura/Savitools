'use client';

import { ToolEmptyState } from '@/components/tools/tool-empty-state';
import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import { EXAMPLE_USDC_ISSUER } from '@/lib/examples';
import {
  findSimulatorPaths,
  type Direction,
  type NetworkChoice,
  type SimulatedPath,
  type AssetType,
} from '@/lib/api';
import { ArrowRight, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

function AssetPicker({
  label,
  assetType,
  assetCode,
  assetIssuer,
  onTypeChange,
  onCodeChange,
  onIssuerChange,
}: {
  label: string;
  assetType: AssetType;
  assetCode: string;
  assetIssuer: string;
  onTypeChange: (t: AssetType) => void;
  onCodeChange: (c: string) => void;
  onIssuerChange: (i: string) => void;
}) {
  const isNative = assetType === 'native';

  return (
    <div className="flex-1 min-w-[200px] space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onTypeChange('native')}
          className={`px-3 py-2 text-sm font-mono rounded-md border transition-colors ${
            isNative
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          XLM
        </button>
        <button
          type="button"
          onClick={() => onTypeChange('credit_alphanum4')}
          className={`px-3 py-2 text-sm rounded-md border transition-colors ${
            !isNative
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          Token
        </button>
      </div>
      {!isNative && (
        <div className="flex gap-2">
          <input
            type="text"
            value={assetCode}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="Code (e.g. USDC)"
            maxLength={12}
            className="w-1/3 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <input
            type="text"
            value={assetIssuer}
            onChange={(e) => onIssuerChange(e.target.value)}
            placeholder="Issuer address"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
        </div>
      )}
    </div>
  );
}

function HopChain({ path }: { path: SimulatedPath }) {
  const allAssets = [path.source_asset, ...path.path, path.destination_asset];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {allAssets.map((asset, i) => (
        <div key={i} className="flex items-center gap-1">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-muted border border-border"
            title={asset.issuer ? `${asset.code}:${asset.issuer}` : asset.label}
          >
            {asset.type === 'native' ? 'XLM' : asset.code ?? '?'}
          </span>
          {i < allAssets.length - 1 && (
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

function PathCard({
  path,
  direction,
  network,
  onSelect,
}: {
  path: SimulatedPath;
  direction: Direction;
  network: NetworkChoice;
  onSelect: (path: SimulatedPath) => void;
}) {
  const [slippage, setSlippage] = useState(path.recommended_slippage.toFixed(1));

  const computedAmount = useMemo(() => {
    const src = parseFloat(path.source_amount);
    const dst = parseFloat(path.destination_amount);
    const pct = parseFloat(slippage) || 0;
    const multiplier = 1 - pct / 100;

    if (direction === 'strict_send') {
      return { label: 'destination_min', value: (dst * multiplier).toFixed(7) };
    } else {
      return { label: 'send_max', value: (src / multiplier).toFixed(7) };
    }
  }, [path, direction, slippage]);

  const composerParams = new URLSearchParams({
    operation: direction === 'strict_send' ? 'pathPaymentStrictSend' : 'pathPaymentStrictReceive',
    source_asset_type: path.source_asset.type,
    destination_asset_type: path.destination_asset.type,
    source_amount: path.source_amount,
    destination_amount: path.destination_amount,
    network,
  });
  if (path.source_asset.code) composerParams.set('source_asset_code', path.source_asset.code);
  if (path.source_asset.issuer) composerParams.set('source_asset_issuer', path.source_asset.issuer);
  if (path.destination_asset.code) composerParams.set('destination_asset_code', path.destination_asset.code);
  if (path.destination_asset.issuer) composerParams.set('destination_asset_issuer', path.destination_asset.issuer);
  if (path.path.length > 0) {
    composerParams.set('path_assets', JSON.stringify(path.path));
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <HopChain path={path} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-0.5">Source</p>
          <p className="font-mono font-medium">{path.source_amount}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Destination</p>
          <p className="font-mono font-medium">{path.destination_amount}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Rate</p>
          <p className="font-mono font-medium">{path.effective_rate}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Hops</p>
          <p className="font-mono font-medium">{path.hops}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-600">
            Recommended: {path.recommended_slippage}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Slippage:</label>
          <input
            type="number"
            min="0"
            max="50"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-20 rounded border border-border bg-background px-2 py-1 text-xs font-mono"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {computedAmount.label} = {computedAmount.value}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSelect(path)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="h-3 w-3" />
          Use in Composer
        </button>
      </div>
    </div>
  );
}

function NoResultsState({ direction }: { direction: Direction }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
      <p className="text-sm font-medium mb-2">No paths found</p>
      <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto">
        <p>
          Stellar could not find a {direction === 'strict_send' ? 'strict send' : 'strict receive'} route
          for this asset pair.
        </p>
        <p>Possible reasons:</p>
        <ul className="list-disc list-inside text-left inline-block mt-1">
          <li>The pair is illiquid — no order book or pool connects these assets</li>
          <li>The issuer address is incorrect or does not exist on this network</li>
          <li>The amount is too large for available liquidity</li>
          <li>The source and destination assets are the same</li>
        </ul>
      </div>
    </div>
  );
}

export function SimulatorTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useExampleOnboarding('simulate');

  const [network, setNetwork] = useState<NetworkChoice>(
    (searchParams.get('network') as NetworkChoice) ?? 'testnet',
  );
  const [direction, setDirection] = useState<Direction>(
    (searchParams.get('direction') as Direction) ?? 'strict_send',
  );

  const [srcType, setSrcType] = useState<AssetType>(
    searchParams.get('src_type') as AssetType ?? 'native',
  );
  const [srcCode, setSrcCode] = useState(searchParams.get('src_code') ?? '');
  const [srcIssuer, setSrcIssuer] = useState(searchParams.get('src_issuer') ?? '');

  const [dstType, setDstType] = useState<AssetType>(
    searchParams.get('dst_type') as AssetType ?? 'credit_alphanum4',
  );
  const [dstCode, setDstCode] = useState(searchParams.get('dst_code') ?? 'USDC');
  const [dstIssuer, setDstIssuer] = useState(
    searchParams.get('dst_issuer') ?? EXAMPLE_USDC_ISSUER,
  );

  const [amount, setAmount] = useState(searchParams.get('amount') ?? '10');

  const [paths, setPaths] = useState<SimulatedPath[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const loadExample = useCallback(() => {
    setSrcType('native');
    setSrcCode('');
    setSrcIssuer('');
    setDstType('credit_alphanum4');
    setDstCode('USDC');
    setDstIssuer(EXAMPLE_USDC_ISSUER);
    setAmount('10');
    setDirection('strict_send');

    setTimeout(() => {
      findSimulatorPaths({
        direction: 'strict_send',
        source_asset_type: 'native',
        amount: '10',
        destination_asset_type: 'credit_alphanum4',
        destination_asset_code: 'USDC',
        destination_asset_issuer: EXAMPLE_USDC_ISSUER,
        network: 'testnet',
      })
        .then((res) => {
          setPaths(res.paths);
          setHasSearched(true);
          markStepComplete();
        })
        .catch((err) => {
          setError(err.message);
        });
    }, 0);
  }, []);

  useEffect(() => {
    if (searchParams.get('example') === '1') {
      loadExample();
    }
  }, [searchParams, loadExample]);

  const markStepComplete = () => {
    import('@/lib/onboarding').then((m) => m.markStepComplete('simulate'));
  };

  const handleFindPaths = async () => {
    setLoading(true);
    setError('');
    setPaths([]);

    try {
      const res = await findSimulatorPaths({
        direction,
        source_asset_type: srcType,
        source_asset_code: srcType !== 'native' ? srcCode : undefined,
        source_asset_issuer: srcType !== 'native' ? srcIssuer : undefined,
        amount,
        destination_asset_type: dstType,
        destination_asset_code: dstType !== 'native' ? dstCode : undefined,
        destination_asset_issuer: dstType !== 'native' ? dstIssuer : undefined,
        network,
      });
      setPaths(res.paths);
      setHasSearched(true);
      markStepComplete();
    } catch (err: any) {
      setError(err.message ?? 'Failed to find paths');
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

  const handleUseInComposer = (path: SimulatedPath) => {
    const params = new URLSearchParams({
      operation: direction === 'strict_send' ? 'pathPaymentStrictSend' : 'pathPaymentStrictReceive',
      source_asset_type: path.source_asset.type,
      destination_asset_type: path.destination_asset.type,
      source_amount: path.source_amount,
      destination_amount: path.destination_amount,
      network,
    });
    if (path.source_asset.code) params.set('source_asset_code', path.source_asset.code);
    if (path.source_asset.issuer) params.set('source_asset_issuer', path.source_asset.issuer);
    if (path.destination_asset.code) params.set('destination_asset_code', path.destination_asset.code);
    if (path.destination_asset.issuer) params.set('destination_asset_issuer', path.destination_asset.issuer);
    if (path.path.length > 0) params.set('path_assets', JSON.stringify(path.path));
    router.push(`/composer?${params.toString()}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFindPaths();
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
      {/* Network + Direction toggle row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setNetwork('mainnet')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              network === 'mainnet'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mainnet
          </button>
          <button
            type="button"
            onClick={() => setNetwork('testnet')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              network === 'testnet'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Testnet
          </button>
        </div>

        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setDirection('strict_send')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              direction === 'strict_send'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Send exactly
          </button>
          <button
            type="button"
            onClick={() => setDirection('strict_receive')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              direction === 'strict_receive'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Receive exactly
          </button>
        </div>
      </div>

      {/* Asset pickers + amount */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <AssetPicker
            label="Source asset"
            assetType={srcType}
            assetCode={srcCode}
            assetIssuer={srcIssuer}
            onTypeChange={setSrcType}
            onCodeChange={setSrcCode}
            onIssuerChange={setSrcIssuer}
          />

          <div className="flex items-end pb-0.5">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <AssetPicker
            label="Destination asset"
            assetType={dstType}
            assetCode={dstCode}
            assetIssuer={dstIssuer}
            onTypeChange={setDstType}
            onCodeChange={setDstCode}
            onIssuerChange={setDstIssuer}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[160px] max-w-[240px] space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10"
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

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !amount.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Find Paths
            </button>
            <button
              type="button"
              onClick={loadExample}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            >
              Try XLM → USDC
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-600">Error finding paths</p>
            <p className="text-xs text-red-500/80 mt-1">{error}</p>
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

      {/* Results */}
      {hasSearched && !loading && !error && (
        <div className="space-y-3">
          {paths.length === 0 ? (
            <NoResultsState direction={direction} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {paths.length} route{paths.length !== 1 ? 's' : ''} found
              </p>
              {paths.map((path, i) => (
                <PathCard
                  key={i}
                  path={path}
                  direction={direction}
                  network={network}
                  onSelect={handleUseInComposer}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasSearched && !loading && !error && (
        <ToolEmptyState
          message="Enter source and destination assets to find payment routes across the Stellar DEX"
          exampleLabel="Try XLM → USDC"
          onExample={loadExample}
        />
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
