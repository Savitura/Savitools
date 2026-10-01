'use client';

/**
 * Multisig signer-weight and threshold simulator (Savitura/Savitools#352).
 *
 * A Stellar multisig is not "2 of 3 signers", it is "any subset of signers
 * totalling at least the threshold". This tool makes that concrete: it collects
 * the signer list and the three weight classes, asks the API what the collected
 * signatures authorise, and names the smallest set of outstanding signers that
 * would close the gap — plus the configuration risks an operator would
 * otherwise only discover on-chain.
 *
 * The arithmetic lives in `apps/api/src/modules/multisig/multisig-weights.ts`;
 * this component validates the form against the bounds the API publishes and
 * renders the answer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Play, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';

import { EmptyState, ErrorState, LoadingState } from '@/components/tools/state-display';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { cn } from '@/lib/utils';
import {
  getMultisigLimits,
  simulateMultisig,
  type MultisigLimits,
  type MultisigRiskSeverity,
  type MultisigSimulationResult,
  type MultisigSignerInput,
} from '@/lib/api';

/** Mirrors `STELLAR_PUBLIC_KEY_PATTERN` in `apps/api/src/common/stellar-address.ts`. */
const PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

/** Falls back to these until `GET /multisig/limits` answers. */
const FALLBACK_LIMITS: MultisigLimits = {
  maxSigners: 21,
  maxSignerWeight: 255,
  maxThreshold: 255,
  operationThresholds: [
    { kind: 'low', gates: 'Trustline and offer operations' },
    { kind: 'medium', gates: 'Payments and path payments' },
    { kind: 'high', gates: 'Account settings and clawbacks' },
  ],
};

const EXAMPLE_SIGNERS: MultisigSignerInput[] = [
  {
    key: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
    weight: 2,
    signed: true,
  },
  {
    key: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    weight: 1,
    signed: true,
  },
  {
    key: 'GBRPYHIL3CI3FNQ4BXNFMNDLFJUNSU2HY3ZMFSLONUCEOASW7QC7OX2H',
    weight: 1,
    signed: false,
  },
];

interface SignerDraft {
  id: string;
  key: string;
  weight: string;
  signed: boolean;
  required: boolean;
}

type FieldErrors = Record<string, string>;

let draftCounter = 0;

function draft(key = '', weight = '1', signed = false, required = false): SignerDraft {
  draftCounter += 1;
  return { id: `signer-${draftCounter}`, key, weight, signed, required };
}

function validateDraft(
  value: SignerDraft,
  limits: MultisigLimits,
): { ok: true; signer: MultisigSignerInput } | { ok: false; error: string } {
  const key = value.key.trim();
  if (!key) return { ok: false, error: 'Required' };
  if (!PUBLIC_KEY_PATTERN.test(key)) {
    return { ok: false, error: 'Not a Stellar account id (G…)' };
  }

  const weight = Number(value.weight);
  if (!Number.isInteger(weight) || weight < 0 || weight > limits.maxSignerWeight) {
    return { ok: false, error: `0–${limits.maxSignerWeight}` };
  }
  if (value.required && weight !== 0) {
    return { ok: false, error: 'A required signer has weight 0' };
  }

  return {
    ok: true,
    signer: { key, weight, signed: value.signed, required: value.required },
  };
}

function validate(
  drafts: SignerDraft[],
  threshold: string,
  lowThreshold: string,
  highThreshold: string,
  limits: MultisigLimits,
): {
  errors: FieldErrors;
  body: {
    threshold: number;
    signers: MultisigSignerInput[];
    lowThreshold?: number;
    highThreshold?: number;
  } | null;
} {
  const errors: FieldErrors = {};

  const parseThreshold = (raw: string, label: string): number | null => {
    if (!raw.trim()) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > limits.maxThreshold) {
      errors[label] = `0–${limits.maxThreshold}`;
      return null;
    }
    return value;
  };

  const medium = parseThreshold(threshold, 'threshold');
  const low = parseThreshold(lowThreshold, 'lowThreshold');
  const high = parseThreshold(highThreshold, 'highThreshold');

  const signers: MultisigSignerInput[] = [];
  drafts.forEach((value) => {
    const parsed = validateDraft(value, limits);
    if (!parsed.ok) {
      errors[value.id] = parsed.error;
      return;
    }
    signers.push(parsed.signer);
  });

  if (drafts.length < 1) errors.signers = 'Add at least one signer';
  if (medium === null && !threshold.trim()) errors.threshold = 'Required';

  const keys = signers.map((entry) => entry.key);
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    errors.signers = 'The same key appears twice; Stellar would count it once';
  }

  if (Object.keys(errors).length > 0 || medium === null) {
    return { errors, body: null };
  }

  return {
    errors,
    body: {
      threshold: medium,
      lowThreshold: low ?? undefined,
      highThreshold: high ?? undefined,
      signers,
    },
  };
}

const SEVERITY_STYLE: Record<
  MultisigRiskSeverity,
  { border: string; text: string; label: string }
> = {
  critical: {
    border: 'border-destructive/40 bg-destructive/5',
    text: 'text-destructive',
    label: 'Critical',
  },
  warning: {
    border: 'border-amber-500/40 bg-amber-500/5',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Warning',
  },
  info: {
    border: 'border-border bg-muted/20',
    text: 'text-muted-foreground',
    label: 'Note',
  },
};

function shortKey(key: string): string {
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function MultisigTool() {
  const [limits, setLimits] = useState<MultisigLimits>(FALLBACK_LIMITS);
  const [limitsError, setLimitsError] = useState('');

  const [threshold, setThreshold] = useState('2');
  const [lowThreshold, setLowThreshold] = useState('');
  const [highThreshold, setHighThreshold] = useState('');
  const [drafts, setDrafts] = useState<SignerDraft[]>(() =>
    EXAMPLE_SIGNERS.map((entry) => draft(entry.key, String(entry.weight), entry.signed)),
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const [result, setResult] = useState<MultisigSimulationResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMultisigLimits()
      .then((payload) => {
        if (!cancelled) setLimits(payload);
      })
      .catch((error: unknown) => {
        // The published bounds only drive the form's own limits, so a failure
        // here must not block the simulation.
        if (cancelled) return;
        setLimitsError(
          error instanceof Error
            ? `Could not load the published limits (${error.message}); using the defaults.`
            : 'Could not load the published limits; using the defaults.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    const check = validate(drafts, threshold, lowThreshold, highThreshold, limits);
    setErrors(check.errors);
    if (!check.body) return;

    setLoading(true);
    setRunError('');
    setResult(null);
    try {
      setResult(await simulateMultisig(check.body));
    } catch (error: unknown) {
      setRunError(error instanceof Error ? error.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  }, [drafts, highThreshold, limits, lowThreshold, threshold]);

  const loadExample = useCallback(() => {
    setThreshold('2');
    setLowThreshold('');
    setHighThreshold('');
    setDrafts(
      EXAMPLE_SIGNERS.map((entry) => draft(entry.key, String(entry.weight), entry.signed)),
    );
    setErrors({});
    setRunError('');
    setResult(null);
  }, []);

  const totalWeight = useMemo(
    () => drafts.reduce((sum, value) => sum + (Number(value.weight) || 0), 0),
    [drafts],
  );

  const patch = useCallback((id: string, change: Partial<SignerDraft>) => {
    setDrafts((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    );
  }, []);

  return (
    <ToolPageShell
      title="Multisig Weight & Threshold Simulator"
      description="Check whether the signatures collected so far authorise an operation, which weight classes are cleared, and exactly which signers are still outstanding."
      docsHref="/docs/multisig"
    >
      <div className="space-y-6">
        {limitsError && (
          <p role="status" className="text-[11px] text-muted-foreground">
            {limitsError}
          </p>
        )}

        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex w-32 flex-col gap-1.5 text-xs font-medium text-foreground">
              Threshold
              <input
                inputMode="numeric"
                aria-describedby="multisig-threshold-error"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">
                Weight the operation needs
              </span>
              <span id="multisig-threshold-error" className="text-[11px] text-destructive">
                {errors.threshold}
              </span>
            </label>

            <label className="flex w-32 flex-col gap-1.5 text-xs font-medium text-foreground">
              Low threshold
              <input
                inputMode="numeric"
                placeholder={threshold || '0'}
                aria-describedby="multisig-low-error"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={lowThreshold}
                onChange={(event) => setLowThreshold(event.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">Defaults to threshold</span>
              <span id="multisig-low-error" className="text-[11px] text-destructive">
                {errors.lowThreshold}
              </span>
            </label>

            <label className="flex w-32 flex-col gap-1.5 text-xs font-medium text-foreground">
              High threshold
              <input
                inputMode="numeric"
                placeholder={threshold || '0'}
                aria-describedby="multisig-high-error"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                value={highThreshold}
                onChange={(event) => setHighThreshold(event.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">Defaults to threshold</span>
              <span id="multisig-high-error" className="text-[11px] text-destructive">
                {errors.highThreshold}
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
                {loading ? 'Simulating…' : 'Simulate'}
              </button>
              <button
                type="button"
                onClick={loadExample}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Load 2-of-3 example
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Signers</h2>
                <p className="text-[11px] text-muted-foreground">
                  {drafts.length} of {limits.maxSigners} · configured weight {totalWeight}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrafts((current) => [...current, draft()])}
                disabled={drafts.length >= limits.maxSigners}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add signer
              </button>
            </div>

            <div className="space-y-2">
              {drafts.map((value) => (
                <div
                  key={value.id}
                  className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-background/40 p-3"
                >
                  <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-xs font-medium text-foreground">
                    Public key
                    <input
                      aria-describedby={`signer-error-${value.id}`}
                      className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                      placeholder="G…"
                      value={value.key}
                      onChange={(event) => patch(value.id, { key: event.target.value })}
                    />
                  </label>

                  <label className="flex w-24 flex-col gap-1.5 text-xs font-medium text-foreground">
                    Weight
                    <input
                      inputMode="numeric"
                      aria-describedby={`signer-error-${value.id}`}
                      className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                      value={value.weight}
                      onChange={(event) => patch(value.id, { weight: event.target.value })}
                    />
                  </label>

                  <label className="flex items-center gap-1.5 pb-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={value.signed}
                      onChange={(event) => patch(value.id, { signed: event.target.checked })}
                    />
                    Signed
                  </label>

                  <label className="flex items-center gap-1.5 pb-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={value.required}
                      onChange={(event) => patch(value.id, { required: event.target.checked })}
                    />
                    Required
                  </label>

                  <button
                    type="button"
                    aria-label={`Remove signer ${value.key ? shortKey(value.key) : ''}`.trim()}
                    onClick={() =>
                      setDrafts((current) => current.filter((entry) => entry.id !== value.id))
                    }
                    disabled={drafts.length === 1}
                    className="mb-1.5 rounded p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <p
                    id={`signer-error-${value.id}`}
                    className="w-full text-[11px] text-destructive"
                  >
                    {errors[value.id]}
                  </p>
                </div>
              ))}
            </div>
            {errors.signers && (
              <p role="alert" className="mt-2 text-[11px] text-destructive">
                {errors.signers}
              </p>
            )}
          </div>
        </div>

        {loading && <LoadingState label="Evaluating the quorum…" />}

        {runError && (
          <ErrorState
            title="The configuration was rejected"
            message={runError}
            icon={<AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />}
            onRetry={submit}
            retryLabel="Try again"
          />
        )}

        {!result && !runError && !loading && (
          <EmptyState
            title="No simulation run yet"
            message="Describe the signers and the threshold, then simulate to see what the collected signatures authorise and who is still outstanding."
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            action={{ label: 'Simulate the 2-of-3 example', onClick: loadExample }}
            tips={[
              'Weights are what matter, not signer count: one signer of weight 2 meets a threshold of 2 alone',
              'Low gates trustlines and offers, medium gates payments, high gates settings and clawbacks',
              'A required master-weight-0 signer blocks every operation until it signs, whatever else is collected',
            ]}
          />
        )}

        {result && (
          <div className="space-y-4">
            <div
              className={cn(
                'rounded-lg border p-5 space-y-4',
                result.canSubmit
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Quorum</h2>
                <p className="text-[11px] text-muted-foreground">
                  {result.signedWeight} of {result.threshold} weight collected
                </p>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={result.threshold}
                  aria-valuenow={result.signedWeight}
                  aria-label="Weight collected against the threshold"
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, result.progressPercent)}%` }}
                />
              </div>

              <p className="text-xs text-foreground">
                {result.canSubmit ? (
                  <>
                    The operation is authorised: {result.signedWeight} weight clears a threshold of{' '}
                    {result.threshold}
                    {result.surplus > 0 && `, ${result.surplus} of it unused`}.
                  </>
                ) : (
                  <>
                    The operation is not authorised yet.{' '}
                    {result.deficit > 0 ? (
                      <>
                        {result.deficit} more weight is needed.
                        {result.minimumSignersNeeded && result.minimumSignersNeeded.length > 0 ? (
                          <>
                            {' '}
                            The smallest set that closes it:{' '}
                            <span className="font-mono">
                              {result.minimumSignersNeeded.map(shortKey).join(', ')}
                            </span>{' '}
                            ({result.minimumSetWeight} weight).
                          </>
                        ) : result.minimumSignersNeeded === null ? (
                          <>
                            {' '}
                            No combination of the remaining signers can reach it.
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {' '}
                        Every required signer has signed, so the weight is sufficient.
                      </>
                    )}
                  </>
                )}
              </p>

              {result.timeBounds.invalid && (
                <p className="text-xs text-destructive">
                  {result.timeBounds.notYetActive
                    ? 'The transaction time bounds have not opened yet, so this signature set is not usable yet.'
                    : 'The transaction time bounds have expired, so this signature set is no longer usable.'}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">Weight classes</h2>
              <div className="grid gap-2 sm:grid-cols-3">
                {result.operationThresholds.map((entry) => {
                  const description = limits.operationThresholds.find(
                    (item) => item.kind === entry.kind,
                  );
                  return (
                    <div
                      key={entry.kind}
                      className={cn(
                        'rounded-md border px-3 py-2',
                        entry.cleared ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20',
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {entry.kind}
                      </p>
                      <p className="font-mono text-sm text-foreground">
                        {entry.collectedWeight} / {entry.requiredWeight}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {entry.cleared
                          ? 'Cleared'
                          : `Needs ${entry.deficit} more`}
                        {description ? ` · ${description.gates}` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">Signers</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-semibold">Signer</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Weight</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Of total</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Signed</th>
                      <th scope="col" className="py-2 font-semibold">Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.signers.map((entry) => (
                      <tr key={entry.key + entry.weight} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3 font-mono">
                          {shortKey(entry.key)}
                          {entry.required && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">required</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono">{entry.weight}</td>
                        <td className="py-2 pr-3 font-mono">{entry.shareOfTotalPercent}%</td>
                        <td className="py-2 pr-3">{entry.signed ? 'Yes' : 'No'}</td>
                        <td className="py-2 text-muted-foreground">
                          {entry.controlsAccount
                            ? 'Alone reaches the threshold'
                            : entry.indispensable
                              ? 'Needed: the quorum fails without it'
                              : 'Could be dropped'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {result.risks.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-5 space-y-2">
                <h2 className="text-sm font-semibold">Findings</h2>
                <ul className="space-y-2">
                  {result.risks.map((risk) => {
                    const style = SEVERITY_STYLE[risk.severity];
                    return (
                      <li
                        key={risk.code}
                        className={cn('rounded-md border px-3 py-2', style.border)}
                      >
                        <p className={cn('text-[10px] font-semibold uppercase tracking-wide', style.text)}>
                          {style.label} · {risk.code}
                        </p>
                        <p className="text-xs text-foreground">{risk.message}</p>
                        {risk.signers && risk.signers.length > 0 && (
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {risk.signers.map(shortKey).join(', ')}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              This simulation is a pure function of the signer list you entered: it reads no
              account state and sends nothing. Check it against the live account with the{' '}
              <a
                href="https://stellar.expert/explorer/public/accounts"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-foreground"
              >
                account explorer
              </a>{' '}
              before relying on it.
            </p>
          </div>
        )}
      </div>
    </ToolPageShell>
  );
}
