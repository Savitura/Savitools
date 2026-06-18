'use client';

import { cn } from '@/lib/utils';
import type { PlaygroundProvider } from '@/lib/api';

interface ApiSelectorProps {
  selected: PlaygroundProvider;
  onSelect: (provider: PlaygroundProvider) => void;
  className?: string;
}

const providers: Array<{ id: PlaygroundProvider; label: string; description: string }> = [
  { id: 'fluxa', label: 'Fluxa', description: 'Payment infrastructure API' },
  { id: 'crowdpay', label: 'CrowdPay', description: 'Crowdfunding platform API' },
];

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
          <p className="text-xs mt-0.5 opacity-70">{provider.description}</p>
        </button>
      ))}
    </div>
  );
}
