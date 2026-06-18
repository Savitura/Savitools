import { Suspense } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { PlaygroundTool } from '@/components/playground/playground-tool';

export default function PlaygroundPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="API Playground"
        description="Explore and test the Fluxa and CrowdPay APIs interactively. Send real requests, inspect responses, and copy cURL commands."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading playground…</p>}>
          <PlaygroundTool />
        </Suspense>
      </ToolPageShell>
    </>
  );
}
