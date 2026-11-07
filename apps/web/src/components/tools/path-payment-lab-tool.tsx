'use client';

/**
 * Path-payment simulation lab (Savitura/Savitools#351).
 *
 * The Payment Simulator answers "is there a route?". This answers the question
 * that follows it: *given a tolerance, how much rate movement can this route
 * absorb before the payment fails?* Every tolerance is priced against one
 * simulated adverse move so the trade-off between "safe" and "cheap" is a
 * number rather than a guess.
 *
 * All arithmetic happens in the API (`slippage-lab.ts`) on exact stroop
 * integers; this component only validates the inputs and renders the table.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Loader2, Play, Scale, X } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/tools/state-display';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { cn } from '@/lib/utils';
import {
  runPathPaymentLab,
  type Direction,
  type NetworkChoice,
  type PathPaymentLabResult,
  type SlippageScenarioOutcome,
  type SlippageVerdict,
} from '@/lib/api';

const TESTNET_USDC_ISSUER =
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';

const EXAMPLE_DESTINATION = `USDC:${TESTNET_USDC_ISSUER}`;

/** Tolerances offered by default; the lab caps a request at ten. */
const DEFAULT_SCENARIOS = [0.1, 0.5, 1, 5];

/** Mirrors the amount pattern the API accepts: 15 integer, 7 fractional digits. */
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/;

const ASSET_PATTERN = /^(?:XLM|[A-Za-z0-9]{1,12}:G[A-Z2-7]{55})$/;

const MAX_SCENARIOS = 10;
const MAX_SCENARIO_PERCENT = 100;

type FieldErrors = Record<string, string>;

interface ScenarioRow {
  id: string;
  value: string;
}

function newRow(value: string): ScenarioRow {
  return { id: `${value}-${Math.random().toString(36).slice(2, 10)}`, value };
}

/** Reads one tolerance input, or explains why it cannot be used. */
function parseScenario(
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Enter a tolerance' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: 'Must be a number' };
  if (value < 0.01) return { ok: false, error: 'Must be at least 0.01%' };
  if (value > MAX_SCENARIO_PERCENT) {
    return { ok: false, error: `Must be at most ${MAX_SCENARIO_PERCENT}%` };
  }
  return { ok: true, value };
}

function validate(
  state: {
    direction: Direction;
    sourceAsset: string;
    destinationAsset: string;
    amount: string;
    adverseMovePercent: string;
    routeIndex: string;
    rows: ScenarioRow[];
  },
): { errors: FieldErrors; scenarios: number[] } {
  const errors: FieldErrors = {};

  if (!ASSET_PATTERN.test(state.sourceAsset.trim())) {
    errors.sourceAsset = 'Use "XLM" or "CODE:ISSUER"';
  }
  if (!ASSET_PATTERN.test(state.destinationAsset.trim())) {
    errors.destinationAsset = 'Use "XLM" or "CODE:ISSUER"';
  }
  if (!AMOUNT_PATTERN.test(state.amount.trim())) {
    errors.amount = 'A positive decimal with at most 7 decimals';
  }

  const move = state.adverseMovePercent.trim();
  if (move) {
    const value = Number(move);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.adverseMovePercent = 'A percentage between 0 and 100';
    }
  }

  const route = state.routeIndex.trim();
  if (route && (!Number.isInteger(Number(route)) || Number(route) < 0)) {
    errors.routeIndex = 'A whole number, 0 or greater';
  }

  const scenarios: number[] = [];
  state.rows.forEach((row, index) => {
    const parsed = parseScenario(row.value);
    if (!parsed.ok) {
      // Blank trailing rows are the normal state of an unused input, so only a
      // row the user has partly typed is reported.
      errors[`scenario-${row.id}`] = parsed.error;
      return;
    }
    scenarios.push(parsed.value);
  });

  if (state.rows.length < 1) {
    errors.scenarios = 'Add at least one tolerance to compare';
  } else if (Object.keys(errors).some((key) => key.startsWith('scenario-'))) {
    errors.scenarios = 'Fix the highlighted tolerances';
  }

  return { errors, scenarios };
}

const VERDICT_STYLE: Record<SlippageVerdict, { label: string; className: string }> = {
  pass: { label: 'Covers the move', className: 'text-foreground' },
  exact: { label: 'Exactly at the limit', className: 'text-foreground' },
  fail: { label: 'Would fail', className: 'text-destructive' },
};

function VerdictBadge({ verdict }: { verdict: SlippageVerdict }) {
  const style = VERDICT_STYLE[verdict];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        style.className,
      )}
    >
      {verdict === 'fail' ? (
        <X className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Check className="h-3 w-3" aria-hidden="true" />
      )}
      {style.label}
    </span>
  );
}

function LabStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm text-foreground">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ScenarioTable({ result }: { result: PathPaymentLabResult }) {
  const { comparison } = result;
  const field = comparison.guaranteeField === 'destinationMin' ? 'Destination minimum' : 'Send maximum';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">
          Slippage tolerances priced against a {comparison.adverseMovePercent}% adverse rate move
        </caption>
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Tolerance
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {field}
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              At the move
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Headroom
            </th>
            <th scope="col" className="py-2 font-semibold">
              Outcome
            </th>
          </tr>
        </thead>
        <tbody>
          {comparison.scenarios.map((scenario: SlippageScenarioOutcome) => {
            const recommended =
              comparison.recommendedSlippagePercent !== null &&
              scenario.slippagePercent === comparison.recommendedSlippagePercent;
            return (
              <tr
                key={scenario.slippagePercent}
                className={cn(
                  'border-b border-border/40 last:border-0',
                  recommended && 'bg-primary/5',
                )}
              >
                <td className="py-2 pr-3 font-mono text-foreground">
                  {scenario.slippagePercent}%
                  {recommended && (
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                      recommended
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono">{scenario.guarantee}</td>
                <td className="py-2 pr-3 font-mono">{scenario.adverseAmount}</td>
                <td
                  className={cn(
                    'py-2 pr-3 font-mono',
                    scenario.headroomPercent < 0 ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {scenario.headroom}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({scenario.headroomPercent > 0 ? '+' : ''}
                    {scenario.headroomPercent}%)
                  </span>
                </td>
                <td className="py-2">
                  <VerdictBadge verdict={scenario.verdict} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PathPaymentLabTool() {
  const [network, setNetwork] = useState<NetworkChoice>('testnet');
  const [direction, setDirection] = useState<Direction>('strict_send');
  const [sourceAsset, setSourceAsset] = useState('XLM');
  const [destinationAsset, setDestinationAsset] = useState(EXAMPLE_DESTINATION);
  const [amount, setAmount] = useState('100');
  const [adverseMovePercent, setAdverseMovePercent] = useState('2');
  const [routeIndex, setRouteIndex] = useState('0');
  const [rows, setRows] = useState<ScenarioRow[]>(() =>
    (DEFAULT_SCENARIOS.map((value) => newRow(String(value)))),
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const [result, setResult] = useState<PathPaymentLabResult | null>(null);

  const submit = useCallback(async () => {
    const check = validate({
      direction,
      sourceAsset,
      destinationAsset,
      amount,
      adverseMovePercent,
      routeIndex,
      rows,
    });
    setErrors(check.errors);
    if (Object.keys(check.errors).length > 0) return;

    setLoading(true);
    setRunError('');
    setResult(null);
    try {
      const move = adverseMovePercent.trim();
      const route = routeIndex.trim();
      setResult(
        await runPathPaymentLab({
          direction,
          sourceAsset: sourceAsset.trim(),
          destinationAsset: destinationAsset.trim(),
          amount: amount.trim(),
          slippageScenarios: check.scenarios,
          adverseMovePercent: move ? Number(move) : 0,
          routeIndex: route ? Number(route) : 0,
          network,
        }),
      );
    } catch (error: unknown) {
      setRunError(error instanceof Error ? error.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  }, [
    adverseMovePercent,
    amount,
    destinationAsset,
    direction,
    network,
    routeIndex,
    rows,
    sourceAsset,
  ]);

  const loadExample = useCallback(() => {
    setNetwork('testnet');
    setDirection('strict_send');
    setSourceAsset('XLM');
    setDestinationAsset(EXAMPLE_DESTINATION);
    setAmount('100');
    setAdverseMovePercent('2');
    setRouteIndex('0');
    setRows((DEFAULT_SCENARIOS.map((value) => newRow(String(value)))));
    setErrors({});
    setRunError('');
    setResult(null);
  }, []);

  const addRow = useCallback(() => {
    setRows((current) =>
      current.length >= MAX_SCENARIOS ? current : [...current, newRow('')],
    );
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const fieldError = useCallback(
    (key: string) => errors[key],
    [errors],
  );

  const routeOptions = useMemo(
    () => Array.from({ length: Math.max(1, result?.routeCount ?? 1) }, (_, index) => index),
    [result?.routeCount],
  );

  return (
    <ToolPageShell
      title="Path-Payment Slippage Lab"
      description="Price several slippage tolerances against one simulated adverse rate move, and see exactly which ones would survive it."
      docsHref="/docs/path-payment-lab"
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Network
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={network}
                onChange={(event) => setNetwork(event.target.value as NetworkChoice)}
              >
                <option value="testnet">Testnet</option>
                <option value="mainnet">Mainnet</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Direction
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={direction}
                onChange={(event) => setDirection(event.target.value as Direction)}
              >
                <option value="strict_send">Send exactly</option>
                <option value="strict_receive">Receive exactly</option>
              </select>
            </label>

            <label className="flex flex-1 min-w-[13rem] flex-col gap-1.5 text-xs font-medium text-foreground">
              Source asset
              <input
                aria-describedby="lab-source-asset-error"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={sourceAsset}
                onChange={(event) => setSourceAsset(event.target.value)}
              />
              <span id="lab-source-asset-error" className="text-[11px] text-destructive">
                {fieldError('sourceAsset')}
              </span>
            </label>

            <label className="flex flex-1 min-w-[13rem] flex-col gap-1.5 text-xs font-medium text-foreground">
              Destination asset
              <input
                aria-describedby="lab-destination-asset-error"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={destinationAsset}
                onChange={(event) => setDestinationAsset(event.target.value)}
              />
              <span id="lab-destination-asset-error" className="text-[11px] text-destructive">
                {fieldError('destinationAsset')}
              </span>
            </label>

            <label className="flex w-40 flex-col gap-1.5 text-xs font-medium text-foreground">
              {direction === 'strict_send' ? 'Send amount' : 'Receive amount'}
              <input
                aria-describedby="lab-amount-error"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span id="lab-amount-error" className="text-[11px] text-destructive">
                {fieldError('amount')}
              </span>
            </label>
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Tolerances to compare</h2>
                <p className="text-[11px] text-muted-foreground">
                  Up to {MAX_SCENARIOS} percentages, at least 0.01% each.
                </p>
              </div>
              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_SCENARIOS}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Add tolerance
              </button>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              {rows.map((row) => (
                <div key={row.id} className="w-28">
                  <label className="sr-only" htmlFor={`tolerance-${row.id}`}>
                    Slippage tolerance percent
                  </label>
                  <div className="relative">
                    <input
                      id={`tolerance-${row.id}`}
                      inputMode="decimal"
                      placeholder="0.5"
                      aria-describedby={`tolerance-error-${row.id}`}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pr-7 font-mono text-sm"
                      value={row.value}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry) =>
                            entry.id === row.id ? { ...entry, value: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove tolerance ${row.value || ''}`.trim()}
                        onClick={() => removeRow(row.id)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p id={`tolerance-error-${row.id}`} className="text-[10px] text-destructive">
                    {fieldError(`scenario-${row.id}`)}
                  </p>
                </div>
              ))}
              <span className="self-center text-[11px] text-muted-foreground">%</span>
            </div>
            {errors.scenarios && (
              <p role="alert" className="mt-2 text-[11px] text-destructive">
                {errors.scenarios}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
            <label className="flex w-44 flex-col gap-1.5 text-xs font-medium text-foreground">
              Adverse rate move (%)
              <input
                inputMode="decimal"
                placeholder="0"
                aria-describedby="lab-move-error lab-move-hint"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={adverseMovePercent}
                onChange={(event) => setAdverseMovePercent(event.target.value)}
              />
              <span id="lab-move-hint" className="text-[11px] text-muted-foreground">
                How much worse the route prices by landing. 0 means no move.
              </span>
              <span id="lab-move-error" className="text-[11px] text-destructive">
                {fieldError('adverseMovePercent')}
              </span>
            </label>

            <label className="flex w-32 flex-col gap-1.5 text-xs font-medium text-foreground">
              Route
              <select
                aria-describedby="lab-route-error"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={routeIndex}
                onChange={(event) => setRouteIndex(event.target.value)}
              >
                {routeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 0 ? 'Best (0)' : `Route ${option}`}
                  </option>
                ))}
              </select>
              <span id="lab-route-error" className="text-[11px] text-destructive">
                {fieldError('routeIndex')}
              </span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {loading ? 'Running…' : 'Run the lab'}
              </button>
              <button
                type="button"
                onClick={loadExample}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                Load example
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Reading live routes from Horizon and pricing each tolerance…
          </p>
        )}

        {runError && (
          <ErrorState
            title="The lab could not run"
            message={runError}
            icon={<AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />}
            onRetry={submit}
            retryLabel="Try again"
            secondaryAction={{
              label: 'Open the Payment Simulator',
              onClick: () => {
                window.location.href = '/simulator';
              },
            }}
          />
        )}

        {!result && !runError && !loading && (
          <EmptyState
            title="No simulation run yet"
            message="Pick an asset pair and an amount, then run the lab to price every tolerance against a single adverse rate move."
            icon={<Scale className="h-5 w-5" aria-hidden="true" />}
            action={{ label: 'Run with the example pair', onClick: loadExample }}
            tips={[
              'Strict send floors the destination, so a floor the move cannot meet fails the payment',
              'Strict receive caps the source, so a cap the move exceeds fails the payment',
              'A tolerance reported as "exactly at the limit" clears only if the rate does not move again',
            ]}
          />
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Route {result.route.index + 1} of {result.routeCount}
                </h2>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {result.sourceAsset} → {result.destinationAsset} · {result.network}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <LabStat
                  label={result.comparison.guaranteeField === 'destinationMin' ? 'Send' : 'Receive'}
                  value={result.comparison.fixedAmount}
                  hint="Pinned by your transaction"
                />
                <LabStat
                  label={
                    result.comparison.guaranteeField === 'destinationMin' ? 'Quoted receive' : 'Quoted cost'
                  }
                  value={result.comparison.quotedVariableAmount}
                  hint={`${result.route.pathLength} hop(s), rate ${result.route.exchangeRate}`}
                />
                <LabStat
                  label="At the adverse move"
                  value={result.comparison.adverseVariableAmount}
                  hint={`Move of ${result.comparison.adverseMovePercent}%`}
                />
                <LabStat
                  label="Route dispersion"
                  value={
                    result.comparison.routeDispersionPercent === null
                      ? 'Best route'
                      : `${result.comparison.routeDispersionPercent}%`
                  }
                  hint={
                    result.comparison.routeDispersionPercent === null
                      ? 'No route is behind the best one'
                      : 'Behind the best available route'
                  }
                />
              </div>

              {result.route.hops.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Route: {result.route.hops.map((hop) => hop.assetCode ?? hop.assetType).join(' → ')}
                </p>
              )}
            </div>

            <div
              className={cn(
                'rounded-lg border p-5 space-y-3',
                result.comparison.exceededByEveryScenario
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Slippage comparison</h2>
                <p className="text-[11px] text-muted-foreground">
                  {result.comparison.tightestSlippagePercent}% –{' '}
                  {result.comparison.widestSlippagePercent}% compared
                </p>
              </div>

              <ScenarioTable result={result} />

              {result.comparison.exceededByEveryScenario ? (
                <p className="text-xs text-destructive">
                  A {result.comparison.adverseMovePercent}% adverse move exceeds every tolerance
                  compared. Widen a tolerance, or wait for the route to recover — every row above
                  would fail as written.
                </p>
              ) : (
                <p className="text-xs text-foreground">
                  The narrowest tolerance that survives this move is{' '}
                  <span className="font-mono">
                    {result.comparison.recommendedSlippagePercent}%
                  </span>
                  , leaving{' '}
                  <span className="font-mono">
                    {result.comparison.recommendedHeadroomPercent}%
                  </span>{' '}
                  of unused headroom above it. Anything tighter than that would fail.
                </p>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Amounts are rounded the way the network rounds them, so the{' '}
              {result.comparison.guaranteeField} above is always one the network accepts. Need the
              raw routes first?{' '}
              <Link href="/simulator" className="underline hover:text-foreground">
                Open the Payment Simulator
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </ToolPageShell>
  );
}
