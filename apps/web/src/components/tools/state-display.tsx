'use client';

import {
  AlertTriangle,
  RefreshCw,
  Search,
  FileQuestion,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─── Skeleton Primitives ──────────────────────────────────────────────────

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted/60', className)}
      {...props}
    />
  );
}

// ─── Page-Level Skeletons ─────────────────────────────────────────────────

export function InspectorSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading inspector results">
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="rounded-lg border border-border bg-background p-5 space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-36 mb-3" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-background p-4 space-y-3"
            >
              <div className="flex justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SandboxAccountSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading account details">
      <div>
        <Skeleton className="h-3 w-28 mb-1" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div>
        <Skeleton className="h-3 w-20 mb-1" />
        <div className="space-y-1">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-16 mb-1" />
        <div className="space-y-1">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-20 mb-1" />
        <Skeleton className="h-7 w-full" />
      </div>
      <div>
        <Skeleton className="h-3 w-16 mb-1" />
        <Skeleton className="h-7 w-full" />
      </div>
    </div>
  );
}

export function ComposerOperationListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading operation palette">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ComposerSimulateSkeleton() {
  return (
    <div
      className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3"
      aria-busy="true"
      aria-label="Running simulation"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" aria-hidden="true" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Skeleton className="h-3 w-24 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div>
          <Skeleton className="h-3 w-28 mb-1" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div>
          <Skeleton className="h-3 w-12 mb-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

export function SimulatorPathSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Finding payment paths">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-border p-4 space-y-3"
        >
          <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-6 w-16 rounded-full" />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-5 w-36 rounded" />
            <Skeleton className="h-7 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonitorFeedSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Connecting to live feed">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonitorWatchesSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading watches">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex justify-between pt-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Generic Spinner Loader ───────────────────────────────────────────────

interface LoadingStateProps {
  label?: string;
  description?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export function LoadingState({
  label = 'Loading…',
  description,
  className,
  size = 'md',
  icon,
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-10 text-center',
        className,
      )}
    >
      <div className="flex items-center justify-center text-muted-foreground gap-3">
        {icon ?? <Loader2 className={cn(sizeClasses[size], 'animate-spin')} aria-hidden="true" />}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground/70 max-w-sm">{description}</p>
      )}
    </div>
  );
}

// ─── Error State with Retry ───────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  icon?: ReactNode;
  className?: string;
  details?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
  icon,
  className,
  details,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'rounded-xl border border-destructive/30 bg-destructive/5 p-6 w-full',
        className,
      )}
    >
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 mb-3 flex-shrink-0">
          {icon ?? <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />}
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-md mb-4 break-words">
          {message}
        </p>
        {details && (
          <details className="mb-4 w-full text-left">
            <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
              View error details
            </summary>
            <pre className="mt-2 p-2 rounded bg-muted/40 text-[10px] font-mono overflow-x-auto text-muted-foreground break-all whitespace-pre-wrap">
              {details}
            </pre>
          </details>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {retryLabel}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State with Guidance ────────────────────────────────────────────

interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  tips?: string[];
  className?: string;
}

/**
 * Base empty state. Exported so a tool with a message that is specific to its
 * own flow can render one without the per-tool wrappers below.
 */
export function EmptyState({
  title,
  message,
  icon,
  action,
  secondaryAction,
  tips,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center',
        className,
      )}
      role="status"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/60 mb-4 text-muted-foreground">
        {icon ?? <Sparkles className="h-5 w-5" aria-hidden="true" />}
      </div>
      {title && (
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      )}
      <p className="text-xs text-muted-foreground max-w-sm mb-5">{message}</p>
      {tips && tips.length > 0 && (
        <ul className="text-[11px] text-muted-foreground/80 max-w-md mb-5 space-y-1 list-disc list-inside text-left">
          {tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
          >
            {action.icon}
            {action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="text-xs font-medium px-4 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Inspector-specific States ────────────────────────────────────────────

interface InspectorEmptyStateProps {
  onExample: () => void;
}

export function InspectorEmptyState({ onExample }: InspectorEmptyStateProps) {
  return (
    <EmptyState
      title="Nothing to inspect yet"
      message="Paste a transaction hash, Stellar address, or raw XDR to get a full human-readable breakdown."
      icon={<Search className="h-5 w-5" aria-hidden="true" />}
      action={{
        label: 'Try example transaction',
        onClick: onExample,
      }}
      tips={[
        'Transaction hash: 64-character hex string (e.g. from Horizon or Stellar Expert)',
        'Stellar address: Public key starting with G (e.g. G...56 chars)',
        'Raw XDR: Base64-encoded transaction envelope from your app',
      ]}
    />
  );
}

export function InspectorAccountEmptyState({
  address,
  onExample,
}: {
  address: string;
  onExample: () => void;
}) {
  return (
    <EmptyState
      title="No transactions found"
      message={`Account ${address.slice(0, 8)}…${address.slice(-6)} has no recorded transactions on this network yet.`}
      tips={[
        'This account may be newly created and not yet funded',
        'Double-check you are on the correct network (testnet vs mainnet)',
        'The address might be a multiplexed (M…) account — try the underlying G… key',
      ]}
      action={{
        label: 'Try example address',
        onClick: onExample,
      }}
    />
  );
}

// ─── Sandbox-specific States ──────────────────────────────────────────────

export function SandboxEmptyAccountState({
  onInspect,
}: {
  onInspect: () => void;
}) {
  return (
    <EmptyState
      title="No account selected"
      message="Generate a keypair above and fund it, or paste any testnet public key to inspect its balances, signers, and flags."
      icon={<FileQuestion className="h-5 w-5" aria-hidden="true" />}
      tips={[
        'Click "Generate Keypair" to create a brand-new test account',
        'Click "Fund on Testnet" to get 10,000 test XLM from Friendbot',
        'Paste any existing testnet G… key into the inspector field',
      ]}
      action={{
        label: 'Inspect generated key',
        onClick: onInspect,
      }}
    />
  );
}

export function SandboxPaymentEmptyState() {
  return (
    <EmptyState
      title="No payment history yet"
      message="Send a test payment above to see its result here, including the transaction hash, fee, and result codes."
      tips={[
        'Use two generated keypairs (both funded) to test payments',
        'Try sending USDC by entering USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN as the asset',
        'Payment memo is optional but useful for tagging transactions',
      ]}
    />
  );
}

// ─── Composer-specific States ─────────────────────────────────────────────

export function ComposerEmptyOpsState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border/60 text-center px-4"
      role="status"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 mb-2 text-muted-foreground">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="text-xs font-medium text-foreground mb-0.5">Transaction is empty</p>
      <p className="text-[11px] text-muted-foreground">
        Click an operation type in the left palette to add it here
      </p>
      <ul className="mt-3 text-[10px] text-muted-foreground/80 space-y-0.5 list-disc list-inside">
        <li>Start with a source account above</li>
        <li>Drag operations up/down to reorder</li>
        <li>Click an operation to edit its fields on the right</li>
      </ul>
    </div>
  );
}

export function ComposerEmptySimulateState() {
  return (
    <div className="text-xs text-muted-foreground/70 px-4 py-3 rounded-xl border border-dashed border-border/40 bg-card/20 text-center">
      Enter a source account and at least one operation, then click <span className="font-medium text-muted-foreground">Simulate</span> to preview the result on Horizon before signing.
    </div>
  );
}

// ─── Simulator-specific States ────────────────────────────────────────────

export function SimulatorEmptyState({
  onExample,
}: {
  onExample: () => void;
}) {
  return (
    <EmptyState
      title="No path search performed"
      message="Enter source and destination assets above to find payment routes across the Stellar DEX and liquidity pools."
      action={{
        label: 'Try XLM → USDC',
        onClick: onExample,
      }}
      tips={[
        'Choose between "Send exactly" (you specify input amount) or "Receive exactly" (you specify output)',
        'Select "Token" instead of XLM to enter a custom asset code + issuer',
        'Results include per-path rate, hops, and recommended slippage',
      ]}
    />
  );
}

export function SimulatorNoPathsState({
  direction,
  onRetry,
}: {
  direction: 'strict_send' | 'strict_receive';
  onRetry: () => void;
}) {
  return (
    <EmptyState
      title="No paths found"
      message={`Stellar could not find a ${direction === 'strict_send' ? 'strict send' : 'strict receive'} route for this asset pair. Try adjusting the amount or a different asset.`}
      icon={<Search className="h-5 w-5" aria-hidden="true" />}
      tips={[
        'The pair is illiquid — no order book or AMM pool connects these assets',
        'Verify the token issuer address is correct and exists on the selected network',
        'Try a smaller amount (larger amounts can exceed available liquidity)',
        'Make sure source and destination assets are different',
      ]}
      action={{
        label: 'Retry search',
        onClick: onRetry,
        icon: <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />,
      }}
    />
  );
}

// ─── Monitor-specific States ──────────────────────────────────────────────

export function MonitorNoWatchesState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <EmptyState
      title="No watches configured"
      message="Create a ledger watch to stream payments, trades, and contract events for a Stellar address in real time."
      action={{
        label: 'Create first watch',
        onClick: onCreate,
      }}
      tips={[
        'Watches support payments, trades (order book fills), and Soroban contract events',
        'Each watch runs in the background via streaming (or polling fallback)',
        'Open the alert panel to configure thresholds and webhooks',
      ]}
    />
  );
}

export function MonitorNoWatchSelectedState() {
  return (
    <EmptyState
      title="Select a watch"
      message="Pick a watch from the left sidebar to see its live ledger activity and saved history. Events stream in as they are confirmed on the network."
      tips={[
        'Green dot = streaming (real-time SSE from Horizon)',
        'Amber dot = polling (fallback mode, ~5s interval)',
        'Red dot = error — hover for the last error message',
      ]}
    />
  );
}

export function MonitorNoEventsState({
  watchLabel,
  eventTypes,
}: {
  watchLabel: string;
  eventTypes: string[];
}) {
  return (
    <div className="flex h-full items-center justify-center text-center p-8">
      <div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 mx-auto mb-3 text-muted-foreground">
          <Search className="h-4 w-4" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">No events yet for {watchLabel}</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Listening for {eventTypes.join(' and ')} events. When a matching transaction is confirmed on Stellar it will appear here instantly.
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-3">
          Tip: trigger a test payment or contract invocation on the selected network to see the event stream live.
        </p>
      </div>
    </div>
  );
}

export function ContractEventsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading contract events">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function ContractEventsEmptyState({
  onExample,
}: {
  onExample?: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center text-center p-8">
      <div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 mx-auto mb-3 text-muted-foreground">
          <Search className="h-4 w-4" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">No events loaded</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Enter a Soroban contract ID to fetch its recent events. Every topic and value is
          decoded from raw ScVal XDR into typed values you can read and filter.
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-3">
          Soroban RPC keeps roughly 24 hours of events, so very old ledgers are unavailable.
        </p>
        {onExample && (
          <button
            type="button"
            onClick={onExample}
            className="mt-4 text-xs text-primary hover:underline"
          >
            Load an example contract
          </button>
        )}
      </div>
    </div>
  );
}

export function ContractEventsNoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-full items-center justify-center text-center p-8">
      <div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 mx-auto mb-3 text-muted-foreground">
          <FileQuestion className="h-4 w-4" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">No events match your filters</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Every loaded event was filtered out. Loosen or remove a criterion to see them again.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-4 text-xs text-primary hover:underline"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
}
