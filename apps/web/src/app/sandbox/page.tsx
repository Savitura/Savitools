'use client';

import { Suspense } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SandboxTool } from '@/components/tools/sandbox-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function SandboxPage() {
  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold mb-2">Wallet Sandbox</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Generate keypairs and fund testnet accounts. Saved wallets persist in your account when
          logged in, or in local storage for guests.
        </p>

        <div className="mb-4 text-xs text-muted-foreground">
          Storage: {isAuthenticated ? 'Backend workspace' : 'Guest localStorage'}
          {!ready ? ' · Loading…' : null}
        </div>

        <form onSubmit={handleAddWallet} className="flex flex-col sm:flex-row gap-3 mb-8">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Wallet label"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Save sandbox wallet
          </button>
        </form>

        <div className="space-y-3">
          {data.wallets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved wallets yet.</p>
          ) : (
            data.wallets.map((wallet) => (
              <div
                key={wallet.id}
                className="border border-border rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <p className="text-sm font-medium">{wallet.label}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-1 break-all">
                    {wallet.publicKey}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveWallet(wallet.id)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <SiteHeader />
      <ToolPageShell
        title="Wallet Sandbox"
        description="Generate keypairs, fund testnet accounts, and create trustlines."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <SandboxTool />
        </Suspense>
      </ToolPageShell>
    </>
  );
}
