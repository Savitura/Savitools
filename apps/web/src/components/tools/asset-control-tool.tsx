'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import {
  assetControlComposerLink,
  buildAccountFlagsXdr,
  buildClawbackXdr,
  buildSetTrustlineFlagsXdr,
  getAssetControlFlags,
  getAssetTrustlines,
  type AssembledAssetOperation,
  type AssetControlFlags,
  type AssetTrustline,
  type AssetTrustlinesResult,
} from '@/lib/api';

/** Rejection reasons the API returns as `error.code`. */
type AssetControlErrorCode =
  | 'CLAWBACK_NOT_ENABLED'
  | 'AUTHORIZATION_IMMUTABLE'
  | 'INVALID_ASSET'
  | 'NO_FLAGS_PROVIDED'
  | 'HORIZON_ERROR';

interface CodedError extends Error {
  code?: AssetControlErrorCode;
}

function errorCode(err: unknown): AssetControlErrorCode | undefined {
  return err instanceof Error ? (err as CodedError).code : undefined;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function shorten(account: string): string {
  return account.length > 16
    ? `${account.slice(0, 8)}…${account.slice(-8)}`
    : account;
}

/** A colour-coded flag badge: green on, amber off, red blocking. */
function FlagBadge({
  label,
  enabled,
  onRetrigger,
}: {
  label: string;
  enabled: boolean;
  onRetrigger?: string;
}) {
  const tone = onRetrigger
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
    : enabled
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : 'border-border/60 bg-background/40 text-muted-foreground';

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${tone}`}
      title={onRetrigger ?? `${label} is ${enabled ? 'enabled' : 'disabled'}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="text-xs font-medium">{onRetrigger ?? (enabled ? 'Enabled' : 'Disabled')}</p>
    </div>
  );
}

function StatusBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
      }`}
    >
      {children}
    </span>
  );
}

interface XdrPreviewState {
  title: string;
  operation: AssembledAssetOperation;
  composerHref: string;
}

export function AssetControlTool() {
  const [code, setCode] = useState('');
  const [issuer, setIssuer] = useState('');
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [loadingTrustlines, setLoadingTrustlines] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<AssetControlErrorCode | undefined>();

  const [flags, setFlags] = useState<AssetControlFlags | null>(null);
  const [trustlines, setTrustlines] = useState<AssetTrustlinesResult | null>(null);

  const [authorizedFilter, setAuthorizedFilter] = useState<'' | 'true' | 'false'>('');
  const [accountFilter, setAccountFilter] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');

  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [clawbackFor, setClawbackFor] = useState<string | null>(null);
  const [clawbackAmount, setClawbackAmount] = useState('');
  const [actionError, setActionError] = useState<{ message: string; code?: AssetControlErrorCode } | null>(null);

  const [editFlagsOpen, setEditFlagsOpen] = useState(false);
  const [flagDraft, setFlagDraft] = useState({
    authorizationRequired: false,
    authorizationRevocable: false,
    authorizationClawbackEnabled: false,
    authorizationImmutable: false,
  });

  const [preview, setPreview] = useState<XdrPreviewState | null>(null);
  const [copied, setCopied] = useState(false);

  const canLoad = code.trim().length > 0 && issuer.trim().length > 0;

  /** Filters go to the API, which applies them across every Horizon page. */
  const loadTrustlines = useCallback(
    async (targetCode: string, targetIssuer: string) => {
      setLoadingTrustlines(true);
      try {
        const result = await getAssetTrustlines(targetCode, targetIssuer, {
          authorized:
            authorizedFilter === '' ? undefined : authorizedFilter === 'true',
          account: accountFilter.trim() || undefined,
          minBalance: minBalance === '' ? undefined : Number(minBalance),
          maxBalance: maxBalance === '' ? undefined : Number(maxBalance),
        });
        setTrustlines(result);
      } catch (err: unknown) {
        setActionError({ message: message(err), code: errorCode(err) });
      } finally {
        setLoadingTrustlines(false);
      }
    },
    [authorizedFilter, accountFilter, minBalance, maxBalance],
  );

  const loadAsset = useCallback(async () => {
    if (!canLoad) {
      return;
    }
    const targetCode = code.trim();
    const targetIssuer = issuer.trim();

    setLoadingAsset(true);
    setLoadError(null);
    setLoadErrorCode(undefined);
    setActionError(null);
    try {
      const loadedFlags = await getAssetControlFlags(targetCode, targetIssuer);
      setFlags(loadedFlags);
      setFlagDraft({
        authorizationRequired: loadedFlags.authorizationRequired,
        authorizationRevocable: loadedFlags.authorizationRevocable,
        authorizationClawbackEnabled: loadedFlags.authorizationClawbackEnabled,
        authorizationImmutable: loadedFlags.authorizationImmutable,
      });
      await loadTrustlines(targetCode, targetIssuer);
    } catch (err: unknown) {
      setFlags(null);
      setTrustlines(null);
      setLoadError(message(err));
      setLoadErrorCode(errorCode(err));
    } finally {
      setLoadingAsset(false);
    }
  }, [canLoad, code, issuer, loadTrustlines]);

  /** Wrap an unsigned-XDR build so every row action shares one error path. */
  const runBuild = useCallback(
    async (
      account: string,
      title: string,
      build: () => Promise<AssembledAssetOperation>,
      compose: (
        operation: AssembledAssetOperation,
      ) => string,
    ) => {
      setBusyAccount(account);
      setActionError(null);
      try {
        const operation = await build();
        setPreview({ title, operation, composerHref: compose(operation) });
      } catch (err: unknown) {
        setActionError({ message: message(err), code: errorCode(err) });
      } finally {
        setBusyAccount(null);
      }
    },
    [],
  );

  const setAuthorization = useCallback(
    (row: AssetTrustline, authorized: boolean) =>
      runBuild(
        row.account,
        authorized ? 'Authorize trustline' : 'Deauthorize trustline',
        () =>
          buildSetTrustlineFlagsXdr(code.trim(), issuer.trim(), {
            account: row.account,
            flags: { authorized },
          }),
        (operation) =>
          assetControlComposerLink({
            operationType: 'setTrustlineFlags',
            code: code.trim(),
            issuer: issuer.trim(),
            account: row.account,
            flags: { authorized },
          }),
      ),
    [code, issuer, runBuild],
  );

  const submitClawback = useCallback(
    (row: AssetTrustline) =>
      runBuild(
        row.account,
        'Clawback',
        () =>
          buildClawbackXdr(code.trim(), issuer.trim(), {
            account: row.account,
            amount: clawbackAmount,
          }),
        (operation) =>
          assetControlComposerLink({
            operationType: 'clawback',
            code: code.trim(),
            issuer: issuer.trim(),
            account: row.account,
            amount: clawbackAmount,
          }),
      ).then(() => setClawbackFor(null)),
    [clawbackAmount, code, issuer, runBuild],
  );

  const submitAccountFlags = useCallback(async () => {
    setBusyAccount('account-flags');
    setActionError(null);
    try {
      const operation = await buildAccountFlagsXdr(code.trim(), issuer.trim(), flagDraft);
      setPreview({
        title: `Set issuer flags (${operation.summary})`,
        operation,
        composerHref: assetControlComposerLink({
          operationType: 'setOptions',
          code: code.trim(),
          issuer: issuer.trim(),
          setFlags: Number(operation.operation.setFlags ?? 0),
          clearFlags: Number(operation.operation.clearFlags ?? 0),
        }),
      });
      setEditFlagsOpen(false);
    } catch (err: unknown) {
      setActionError({ message: message(err), code: errorCode(err) });
    } finally {
      setBusyAccount(null);
    }
  }, [code, issuer, flagDraft]);

  const rows = useMemo(() => trustlines?.trustlines ?? [], [trustlines]);

  const copyXdr = useCallback(() => {
    if (!preview) return;
    void navigator.clipboard.writeText(preview.operation.xdr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [preview]);

  return (
    <div className="flex flex-col gap-6">
      {/* Asset selector ------------------------------------------------- */}
      <section className="rounded-xl border border-border/60 bg-background/40 p-4">
        <h2 className="text-sm font-semibold mb-3">Asset</h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Asset Code
            </span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="USDC"
              maxLength={12}
              className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Issuer Public Key
            </span>
            <input
              value={issuer}
              onChange={(event) => setIssuer(event.target.value.trim())}
              placeholder="G… (56-character Stellar public key)"
              maxLength={56}
              className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadAsset()}
            disabled={!canLoad || loadingAsset}
            className="self-end inline-flex items-center gap-2 rounded-lg border border-violet-500/50 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loadingAsset ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Load Asset
          </button>
        </div>

        {loadError && (
          <p className="mt-3 flex items-start gap-2 text-xs text-rose-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {loadErrorCode ? <span className="font-mono">{loadErrorCode}: </span> : null}
              {loadError}
            </span>
          </p>
        )}
      </section>

      {/* Flags panel ---------------------------------------------------- */}
      {flags && (
        <section className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Issuer Asset Control Flags
              <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">
                {shorten(flags.account)}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setEditFlagsOpen((open) => !open)}
              disabled={flags.authorizationImmutable}
              title={
                flags.authorizationImmutable
                  ? 'AUTHORIZATION_IMMUTABLE blocks further flag changes'
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Flags
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FlagBadge label="Authorization Required" enabled={flags.authorizationRequired} />
            <FlagBadge label="Authorization Revocable" enabled={flags.authorizationRevocable} />
            <FlagBadge
              label="Clawback Enabled"
              enabled={flags.authorizationClawbackEnabled}
            />
            <FlagBadge
              label="Authorization Immutable"
              enabled={flags.authorizationImmutable}
              onRetrigger={flags.authorizationImmutable ? 'Locked' : undefined}
            />
          </div>

          {flags.authorizationImmutable && (
            <p className="mt-3 flex items-start gap-2 text-xs text-amber-300">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              AUTHORIZATION_IMMUTABLE is set: this issuer&apos;s flags can never be changed
              again.
            </p>
          )}

          {editFlagsOpen && !flags.authorizationImmutable && (
            <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Desired state — the API diffs these against the issuer&apos;s current flags
                and returns an unsigned <span className="font-mono">SetOptions</span>{' '}
                transaction.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ['authorizationRequired', 'Authorization Required'],
                    ['authorizationRevocable', 'Authorization Revocable'],
                    ['authorizationClawbackEnabled', 'Clawback Enabled'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={flagDraft[key]}
                      onChange={(event) =>
                        setFlagDraft((draft) => ({ ...draft, [key]: event.target.checked }))
                      }
                      className="h-3.5 w-3.5 rounded border-border/60 bg-background/50"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void submitAccountFlags()}
                disabled={busyAccount === 'account-flags'}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 transition-colors"
              >
                {busyAccount === 'account-flags' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Build SetOptions XDR
              </button>
            </div>
          )}
        </section>
      )}

      {/* Action error --------------------------------------------------- */}
      {actionError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {actionError.code ? (
                <span className="font-mono font-semibold">{actionError.code}: </span>
              ) : null}
              {actionError.message}
            </span>
          </p>
          {actionError.code === 'CLAWBACK_NOT_ENABLED' && (
            <button
              type="button"
              onClick={() => {
                setFlagDraft((draft) => ({
                  ...draft,
                  authorizationClawbackEnabled: true,
                }));
                setEditFlagsOpen(true);
                setActionError(null);
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-400/40 px-2 py-1 font-medium hover:bg-rose-500/20 transition-colors"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              Enable clawback on the issuer first
            </button>
          )}
        </div>
      )}

      {/* Trustline table ------------------------------------------------ */}
      {trustlines && (
        <section className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Trustlines
              <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">
                {trustlines.total} shown / {trustlines.fetched} holders /{' '}
                {trustlines.pages} Horizon page{trustlines.pages === 1 ? '' : 's'}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => void loadTrustlines(code.trim(), issuer.trim())}
              disabled={loadingTrustlines}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:border-foreground/30 disabled:opacity-40 transition-colors"
            >
              {loadingTrustlines ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Apply Filters
            </button>
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Authorization
              </span>
              <select
                value={authorizedFilter}
                onChange={(event) =>
                  setAuthorizedFilter(event.target.value as '' | 'true' | 'false')
                }
                className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              >
                <option value="">All</option>
                <option value="true">Authorized</option>
                <option value="false">Unauthorized</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Account
              </span>
              <input
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value.trim())}
                placeholder="G… (substring match)"
                className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Min Balance
              </span>
              <input
                value={minBalance}
                onChange={(event) => setMinBalance(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Max Balance
              </span>
              <input
                value={maxBalance}
                onChange={(event) => setMaxBalance(event.target.value)}
                inputMode="decimal"
                placeholder="unbounded"
                className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Account</th>
                  <th className="py-2 pr-3 font-semibold">Balance</th>
                  <th className="py-2 pr-3 font-semibold">Limit</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {loadingTrustlines ? 'Loading…' : 'No trustlines match these filters.'}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.account} className="border-t border-border/40">
                    <td className="py-2 pr-3 font-mono" title={row.account}>
                      {shorten(row.account)}
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.balance}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">
                      {row.limit ?? '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge ok={row.authorized}>
                          {row.authorized ? 'authorized' : 'unauthorized'}
                        </StatusBadge>
                        {row.authorizedToMaintainLiabilities && (
                          <StatusBadge ok>ATML</StatusBadge>
                        )}
                        {row.clawbackEnabled && <StatusBadge ok>clawback</StatusBadge>}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.authorized ? (
                          <button
                            type="button"
                            onClick={() => void setAuthorization(row, false)}
                            disabled={busyAccount === row.account}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/10 disabled:opacity-40 transition-colors"
                          >
                            <Undo2 className="h-3 w-3" aria-hidden="true" />
                            Deauthorize
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void setAuthorization(row, true)}
                            disabled={busyAccount === row.account}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                          >
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            Authorize
                          </button>
                        )}
                        {clawbackFor === row.account ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              value={clawbackAmount}
                              onChange={(event) => setClawbackAmount(event.target.value)}
                              inputMode="decimal"
                              placeholder="amount"
                              className="w-24 rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                            />
                            <button
                              type="button"
                              onClick={() => void submitClawback(row)}
                              disabled={busyAccount === row.account || !clawbackAmount}
                              className="rounded-md border border-violet-500/40 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
                            >
                              Build
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClawbackFor(null);
                                setClawbackAmount('');
                              }}
                              className="rounded-md border border-border/60 p-1 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Cancel clawback"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setClawbackFor(row.account);
                              setClawbackAmount('');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] hover:border-foreground/30 transition-colors"
                          >
                            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                            Clawback
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {trustlines.truncated && (
            <p className="mt-3 text-xs text-amber-300">
              Horizon scan stopped at {trustlines.pages} pages; narrow the filters for a
              complete answer.
            </p>
          )}
        </section>
      )}

      {/* XDR preview modal --------------------------------------------- */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border/60 bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{preview.title}</h2>
                <p className="text-xs text-muted-foreground">
                  Unsigned XDR — the issuer signs it themselves. The API never holds a
                  secret key.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-md border border-border/60 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close XDR preview"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <dl className="mb-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="inline font-semibold text-foreground">Operation: </dt>
                <dd className="inline font-mono">{preview.operation.operationType}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground">Source: </dt>
                <dd className="inline font-mono">
                  {shorten(preview.operation.sourceAccount)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline font-semibold text-foreground">Network: </dt>
                <dd className="inline">
                  {preview.operation.network} (
                  <span className="font-mono">
                    {preview.operation.networkPassphrase}
                  </span>
                  )
                </dd>
              </div>
            </dl>

            <textarea
              readOnly
              value={preview.operation.xdr}
              rows={6}
              className="w-full rounded-lg border border-border/60 bg-background/50 p-3 font-mono text-[11px] break-all focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyXdr}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:border-foreground/30 transition-colors"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy XDR'}
              </button>
              <a
                href={preview.composerHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/20 transition-colors"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                Open in Composer
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
