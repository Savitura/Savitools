'use client';

import { ToolEmptyState } from '@/components/tools/tool-empty-state';
import { EXAMPLE_STELLAR_ADDRESS } from '@/lib/examples';
import { useState } from 'react';

export function ComposerTool() {
  const [operations, setOperations] = useState<{ type: string; detail: string }[]>([]);

  const loadExample = () => {
    setOperations([
      { type: 'Payment', detail: 'Send 10 XLM to a testnet address' },
      { type: 'Change Trust', detail: 'Trust USDC on testnet' },
    ]);
  };

  return (
    <div>
      {operations.length === 0 ? (
        <ToolEmptyState
          message="Add operations to build a multi-op Stellar transaction"
          exampleLabel="Load sample payment + trustline"
          onExample={loadExample}
        />
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {operations.map((op, i) => (
            <div key={i} className="p-4">
              <p className="text-sm font-medium">{op.type}</p>
              <p className="text-xs text-muted-foreground mt-1">{op.detail}</p>
            </div>
          ))}
          <p className="p-4 text-xs text-muted-foreground">
            Visual composer will connect to the API — implementation in progress.
          </p>
        </div>
      )}
    </div>
  );
}

export function WebhooksTool() {
  const [endpoint, setEndpoint] = useState('');

  const loadExample = () => {
    setEndpoint('https://example.com/webhooks/stellar');
  };

  return (
    <div>
      <input
        type="url"
        value={endpoint}
        onChange={(e) => setEndpoint(e.target.value)}
        placeholder="Your webhook endpoint URL"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono mb-6"
      />

      {!endpoint ? (
        <ToolEmptyState
          message="Enter an endpoint URL to test CrowdPay or Fluxa webhook payloads"
          exampleLabel="Use sample endpoint"
          onExample={loadExample}
        />
      ) : (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm font-medium mb-2">Endpoint ready</p>
          <p className="text-xs font-mono text-muted-foreground break-all">{endpoint}</p>
          <p className="text-xs text-muted-foreground mt-4">
            Webhook firing will connect to the API — implementation in progress.
          </p>
        </div>
      )}
    </div>
  );
}

export function MonitorTool() {
  const [address, setAddress] = useState('');

  const loadExample = () => {
    setAddress(EXAMPLE_STELLAR_ADDRESS);
  };

  return (
    <div>
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Stellar address or contract ID"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono mb-6"
      />

      {!address ? (
        <ToolEmptyState
          message="Enter a Stellar address or contract to watch for live activity"
          exampleLabel="Watch sample address"
          onExample={loadExample}
        />
      ) : (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm font-medium mb-2">Watching</p>
          <p className="text-xs font-mono text-muted-foreground break-all">{address}</p>
          <p className="text-xs text-muted-foreground mt-4">
            Horizon SSE streaming will connect to the API — implementation in progress.
          </p>
        </div>
      )}
    </div>
  );
}
