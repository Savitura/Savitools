import { SiteHeader } from '@/components/layout/site-header';
import { MonitorTool } from '@/components/tools/other-tools';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function MonitorPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Ledger Monitor"
        description="Watch Stellar addresses and contracts for live activity."
      >
        <MonitorTool />
      </ToolPageShell>
    </>
  );
}
