import { SiteHeader } from '@/components/layout/site-header';
import { SimulatorTool } from '@/components/tools/simulator-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { Suspense } from 'react';

export default function SimulatorPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Payment Simulator"
        description="Simulate path payments, preview routing, and estimate fees."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <SimulatorTool />
        </Suspense>
      </ToolPageShell>
    </>
  );
}
