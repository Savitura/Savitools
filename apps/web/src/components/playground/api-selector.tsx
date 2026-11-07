'use client';

import { cn } from '@/lib/utils';
import type { PlaygroundProvider } from '@/lib/api';
import { resolvePlaygroundBaseUrl } from '@/lib/playground-origins';

interface ApiSelectorProps {
  selected: PlaygroundProvider;
  onSelect: (provider: PlaygroundProvider) => void;
  className?: string;
}

type SelectableProvider = 'fluxa' | 'crowdpay';

const providers: Array<{ id: SelectableProvider; label: string }> = [
  { id: 'fluxa', label: 'Fluxa' },
  { id: 'crowdpay', label: 'CrowdPay' },
];

function hostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * The host shown next to a provider comes from the same resolver the cURL
 * sample uses, so a deployment that overrides NEXT_PUBLIC_CROWDPAY_API_URL
 * never ends up labelling the button with the hosted default.
 */
function describeProvider(id: SelectableProvider): string {
  if (id === 'fluxa') {
    return 'Payment infrastructure API (Sandbox / mock — not hosted publicly yet)';
  }

  return `Crowdfunding platform API (Live at ${hostLabel(resolvePlaygroundBaseUrl('crowdpay'))})`;
}

export function ApiSelector({ selected, onSelect, className }: ApiSelectorProps) {
  return (
    <div className={cn('flex gap-2', className)}>
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => onSelect(provider.id)}
          className={cn(
            'flex-1 rounded-lg border px-4 py-3 text-left transition-colors',
            selected === provider.id
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50',
          )}
        >
          <p className="text-sm font-medium">{provider.label}</p>
          <p className="text-xs mt-0.5 opacity-70">{describeProvider(provider.id)}</p>
        </button>
      ))}
    </div>
  );
}
