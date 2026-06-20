import { SiteHeader } from '@/components/layout/site-header';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { WebhookTester } from '@/components/webhooks/webhook-tester';

export default function WebhooksPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Webhook Tester"
        description="Send test CrowdPay and Fluxa webhook payloads to your endpoint, inspect responses, and replay deliveries."
      >
        <WebhookTester />
      </ToolPageShell>
    </>
  );
}
