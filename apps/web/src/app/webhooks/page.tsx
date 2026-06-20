import { SiteHeader } from '@/components/layout/site-header';
import { WebhooksTool } from '@/components/tools/other-tools';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function WebhooksPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Webhook Infrastructure"
        description="Test CrowdPay and Fluxa webhook payloads against your endpoint."
      >
        <WebhooksTool />
      </ToolPageShell>
    </>
  );
}
