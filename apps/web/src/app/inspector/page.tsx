import { SiteHeader } from '@/components/layout/site-header';
import { InspectorTool } from '@/components/tools/inspector-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { Suspense } from 'react';

export default function InspectorPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Transaction Inspector"
        description="Decode and visualize Stellar transactions, operations, and XDR."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <InspectorTool />
        </Suspense>
      </ToolPageShell>
    </>
  );
}
