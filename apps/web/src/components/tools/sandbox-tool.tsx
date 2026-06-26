'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypair } from '@stellar/stellar-sdk';
import {
  Wallet,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  Send,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  sandboxFund,
  sandboxGetAccount,
  sandboxSendPayment,
  type SandboxAccountDetails,
  type SandboxFundResult,
  type SandboxPaymentResult,
  type Balance,
} from '@/lib/api';
import { useNetwork } from '@/lib/network-context';

interface GeneratedKeypair {
  publicKey: string;
  secretKey: string;
}

interface AccountInspectorState {
  publicKey: string;
  account: SandboxAccountDetails | null;
  loading: boolean;
  error: string | null;
}

interface PaymentFormState {
  fromSecret: string;
  toPublicKey: string;
  asset: string;
  amount: string;
  memo: string;
  assetError: string | null;
}

export function SandboxTool() {
  const { network } = useNetwork();
  const [keypair, setKeypair] = useState<GeneratedKeypair | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  
  const [fundResult, setFundResult] = useState<SandboxFundResult | null>(null);
  const [funding, setFunding] = useState(false);
  
  const [inspector, setInspector] = useState<AccountInspectorState>({
    publicKey: '',
    account: null,
    loading: false,
    error: null,
  });
  
  const [payment, setPayment] = useState<PaymentFormState>({
    fromSecret: '',
    toPublicKey: '',
    asset: 'XLM',
    amount: '',
    memo: '',
    assetError: null,
  });
  const [sending, setSending] = useState(false);
  const [paymentResult, setPaymentResult] = useState<SandboxPaymentResult | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleGenerateKeypair = () => {
    setGenerating(true);
    try {
      const pair = Keypair.random();
      setKeypair({
        publicKey: pair.publicKey(),
        secretKey: pair.secret(),
      });
      setRevealed(false);
      setFundResult(null);
    } catch (err) {
      console.error('Failed to generate keypair:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleFund = async () => {
    if (!keypair) return;
    setFunding(true);
    setFundResult(null);
    try {
      const result = await sandboxFund(keypair.publicKey);
      setFundResult(result);
      // Auto-refresh inspector if it matches
      if (inspector.publicKey === keypair.publicKey) {
        handleInspectAccount(keypair.publicKey);
      }
    } catch (err) {
      console.error('Funding failed:', err);
    } finally {
      setFunding(false);
    }
  };

  const handleInspectAccount = async (publicKey: string) => {
    setInspector((prev) => ({ ...prev, publicKey, loading: true, error: null, account: null }));
    try {
      const account = await sandboxGetAccount(publicKey);
      setInspector((prev) => ({ ...prev, account, loading: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load account';
      setInspector((prev) => ({ ...prev, error: message, loading: false }));
    }
  };

  const validateAsset = (value: string) => {
    if (value === 'XLM') {
      setPayment((prev) => ({ ...prev, assetError: null }));
      return;
    }
    const parts = value.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].length > 12 || parts[1].length !== 56) {
      setPayment((prev) => ({ ...prev, assetError: 'Invalid format. Use CODE:ISSUER (e.g., USDC:G...) or XLM' }));
    } else {
      setPayment((prev) => ({ ...prev, assetError: null }));
    }
  };

  const handleSendPayment = async () => {
    if (!payment.fromSecret || !payment.toPublicKey || !payment.asset || !payment.amount) {
      setPaymentError('Please fill in all required fields');
      return;
    }

    if (payment.assetError) {
      setPaymentError('Please fix the asset format error');
      return;
    }

    setSending(true);
    setPaymentError(null);
    setPaymentResult(null);

    try {
      const result = await sandboxSendPayment(
        payment.fromSecret,
        payment.toPublicKey,
        payment.asset,
        payment.amount,
        payment.memo || undefined,
      );
      setPaymentResult(result);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setSending(false);
    }
  };

  const stellarExpertUrl = (txHash: string) => `https://stellar.expert/tx/${txHash}?network=testnet`;

  // Disable sandbox features on mainnet
  if (network === 'mainnet') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">
            <strong>Sandbox features are disabled on mainnet.</strong> Switch to testnet to use the wallet sandbox.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Persistent warning banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          <strong>This sandbox is for Stellar testnet only. Never use generated keys for real funds.</strong>
        </p>
      </div>

      {/* Generate Keypair Section */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h3 className="text-sm font-medium">Generate Keypair</h3>
        
        <button
          type="button"
          onClick={handleGenerateKeypair}
          disabled={generating}
          className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating keypair...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Generate Keypair
            </>
          )}
        </button>

        {keypair && (
          <div className="space-y-3">
            {/* Public Key */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Public Key</span>
                <button
                  type="button"
                  onClick={() => handleCopy(keypair.publicKey, 'pub')}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {copiedKey === 'pub' ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedKey === 'pub' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs font-mono break-all bg-muted/50 px-2 py-1.5 rounded">
                {keypair.publicKey}
              </p>
            </div>

            {/* Secret Key */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Secret Key</span>
                <button
                  type="button"
                  onClick={() => setRevealed(!revealed)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {revealed ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {revealed ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <p className="text-xs font-mono break-all bg-muted/50 px-2 py-1.5 rounded">
                {revealed ? (
                  <>
                    {keypair.secretKey}
                    <button
                      type="button"
                      onClick={() => handleCopy(keypair.secretKey, 'sec')}
                      className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedKey === 'sec' ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </>
                ) : (
                  <span className="text-muted-foreground/50">••••••••••••••••••••••••••••••</span>
                )}
              </p>
            </div>

            {/* Fund on Testnet */}
            <button
              type="button"
              onClick={handleFund}
              disabled={funding}
              className="w-full px-3 py-2 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {funding ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Funding...
                </>
              ) : (
                <>
                  <ExternalLink className="h-3 w-3" />
                  Fund on Testnet
                </>
              )}
            </button>

            {fundResult && (
              <div className="rounded-md bg-green-500/10 border border-green-500/30 p-2">
                <p className="text-xs text-green-700">
                  <strong>Funded successfully!</strong> {fundResult.startingBalance}
                </p>
                {fundResult.txHash && (
                  <a
                    href={stellarExpertUrl(fundResult.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 hover:underline flex items-center gap-1 mt-1"
                  >
                    View transaction <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account Inspector */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h3 className="text-sm font-medium">Account Inspector</h3>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={inspector.publicKey}
            onChange={(e) => setInspector((prev) => ({ ...prev, publicKey: e.target.value }))}
            placeholder="Enter public key"
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => handleInspectAccount(inspector.publicKey)}
            disabled={inspector.loading || !inspector.publicKey}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-1.5"
          >
            {inspector.loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
          </button>
        </div>

        {inspector.error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2">
            <p className="text-xs text-red-700">{inspector.error}</p>
          </div>
        )}

        {inspector.account && (
          <div className="space-y-3">
            {/* Sequence Number */}
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Sequence Number
              </span>
              <p className="text-xs font-mono bg-muted/50 px-2 py-1.5 rounded">{inspector.account.sequenceNumber}</p>
            </div>

            {/* Balances */}
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Balances
              </span>
              <div className="space-y-1">
                {inspector.account.balances.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs font-mono bg-muted/30 px-2 py-1.5 rounded"
                  >
                    <span>
                      {b.assetCode || b.assetType === 'native' ? 'XLM' : b.assetType}
                      {b.assetIssuer && (
                        <span className="text-muted-foreground ml-1">
                          :{b.assetIssuer.slice(0, 8)}...
                        </span>
                      )}
                      {b.limit && <span className="text-muted-foreground ml-1">(limit: {b.limit})</span>}
                    </span>
                    <span>{parseFloat(b.balance).toFixed(7)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Signers */}
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Signers
              </span>
              <div className="space-y-1">
                {inspector.account.signers.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs font-mono bg-muted/30 px-2 py-1.5 rounded"
                  >
                    <span className="truncate">{s.publicKey}</span>
                    <span className="text-muted-foreground">weight: {s.weight}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Thresholds */}
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Thresholds
              </span>
              <div className="flex gap-2 text-xs font-mono bg-muted/30 px-2 py-1.5 rounded">
                <span>Low: {inspector.account.thresholds.lowThreshold}</span>
                <span>Med: {inspector.account.thresholds.medThreshold}</span>
                <span>High: {inspector.account.thresholds.highThreshold}</span>
              </div>
            </div>

            {/* Flags */}
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Flags
              </span>
              <div className="flex gap-2 text-xs bg-muted/30 px-2 py-1.5 rounded">
                <span className={inspector.account.flags.authRequired ? 'text-green-600' : 'text-muted-foreground'}>
                  Auth Required: {inspector.account.flags.authRequired ? 'Yes' : 'No'}
                </span>
                <span className={inspector.account.flags.authRevocable ? 'text-green-600' : 'text-muted-foreground'}>
                  Auth Revocable: {inspector.account.flags.authRevocable ? 'Yes' : 'No'}
                </span>
                <span className={inspector.account.flags.authImmutable ? 'text-green-600' : 'text-muted-foreground'}>
                  Auth Immutable: {inspector.account.flags.authImmutable ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Send Test Payment */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h3 className="text-sm font-medium">Send Test Payment</h3>
        
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
              From Secret Key
            </label>
            <input
              type="password"
              value={payment.fromSecret}
              onChange={(e) => setPayment((prev) => ({ ...prev, fromSecret: e.target.value }))}
              placeholder="S..."
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
              To Public Key
            </label>
            <input
              type="text"
              value={payment.toPublicKey}
              onChange={(e) => setPayment((prev) => ({ ...prev, toPublicKey: e.target.value }))}
              placeholder="G..."
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Asset
              </label>
              <input
                type="text"
                value={payment.asset}
                onChange={(e) => {
                  setPayment((prev) => ({ ...prev, asset: e.target.value }));
                  validateAsset(e.target.value);
                }}
                placeholder="XLM or CODE:ISSUER"
                className={`w-full rounded-md border ${payment.assetError ? 'border-red-500' : 'border-border'} bg-background px-2.5 py-1.5 text-xs font-mono`}
              />
              {payment.assetError && (
                <p className="text-[10px] text-red-500 mt-1">{payment.assetError}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Amount
              </label>
              <input
                type="text"
                value={payment.amount}
                onChange={(e) => setPayment((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="10.5"
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
              Memo (optional)
            </label>
            <input
              type="text"
              value={payment.memo}
              onChange={(e) => setPayment((prev) => ({ ...prev, memo: e.target.value }))}
              placeholder="Optional memo text"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <button
            type="button"
            onClick={handleSendPayment}
            disabled={sending}
            className="w-full px-3 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {sending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3 w-3" />
                Send Payment
              </>
            )}
          </button>

          {paymentError && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2">
              <p className="text-xs text-red-700">{paymentError}</p>
            </div>
          )}

          {paymentResult && (
            <div className="rounded-md bg-green-500/10 border border-green-500/30 p-2 space-y-1">
              <p className="text-xs text-green-700">
                <strong>Payment successful!</strong>
              </p>
              <p className="text-xs font-mono text-green-600">
                TX: {paymentResult.txHash.slice(0, 16)}...
              </p>
              <p className="text-xs text-green-600">
                Fee: {paymentResult.feeCharged} stroops
              </p>
              <p className="text-xs text-green-600">
                Result: {paymentResult.resultCode}
              </p>
              <a
                href={stellarExpertUrl(paymentResult.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-600 hover:underline flex items-center gap-1"
              >
                View on Stellar Expert <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
