import { SiteHeader } from '@/components/layout/site-header';
import { MonitorDashboard } from '@/components/monitor/monitor-dashboard';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function MonitorPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Ledger Monitor"
        description="Watch Stellar addresses and contracts for live activity."
      >
        <MonitorDashboard />
      </ToolPageShell>
    </>
  );
}
