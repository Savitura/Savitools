'use client';

import { ToolEmptyState } from '@/components/tools/tool-empty-state';
import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import { markStepComplete } from '@/lib/onboarding';
import { KeyRound, Wallet } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface WalletInfo {
  publicKey: string;
  secretKey: string;
  funded: boolean;
}

function generateMockWallet(): WalletInfo {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const segment = () =>
    Array.from({ length: 56 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return {
    publicKey: `G${segment()}`,
    secretKey: `S${segment()}`,
    funded: true,
  };
}

export function SandboxTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldCreate = searchParams.get('action') === 'create';
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  useExampleOnboarding('sandbox');

  useEffect(() => {
    if (shouldCreate && searchParams.get('example') === '1') {
      setWallet(generateMockWallet());
    }
  }, [shouldCreate, searchParams]);

  const createWallet = () => {
    setWallet(generateMockWallet());
    markStepComplete('sandbox');
    router.replace('/sandbox?action=create&example=1');
  };

  return (
    <div>
      {!wallet ? (
        <ToolEmptyState
          message="Create your first testnet wallet to start experimenting"
          exampleLabel="Create funded wallet"
          onExample={createWallet}
        />
      ) : (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4" />
            Testnet wallet created
            {wallet.funded && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                Funded
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Public key</p>
            <p className="text-sm font-mono break-all">{wallet.publicKey}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <KeyRound className="h-3 w-3" /> Secret key (testnet only)
            </p>
            <p className="text-sm font-mono break-all text-muted-foreground">{wallet.secretKey}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Friendbot funding will connect to the API — implementation in progress.
          </p>
        </div>
      )}
    </div>
  );
}
