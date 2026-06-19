'use client';

import { Suspense } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SandboxTool } from '@/components/tools/sandbox-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function SandboxPage() {
  return (
    <>
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
