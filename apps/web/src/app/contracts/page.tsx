import { SiteHeader } from '@/components/layout/site-header';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ContractsTool } from '@/components/tools/contracts-tool';
import { Suspense } from 'react';

export default function ContractsPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Contract Deployer"
        description="Upload a compiled Soroban WASM and deploy it to testnet."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ContractsTool />
        </Suspense>
      </ToolPageShell>
    </>
  );
}
