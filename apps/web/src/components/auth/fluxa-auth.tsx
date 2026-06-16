'use client';

import { markStepComplete } from '@/lib/onboarding';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

export function FluxaAuthPage() {
  const handleConnect = () => {
    markStepComplete('fluxa');
  };

  return (
    <div className="max-w-lg">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect your Fluxa account to use your API keys inside SaviTools — in the API
          Playground, Webhook Tester, and SDK Generator.
        </p>
        <a
          href="https://github.com/Savitura/Fluxa"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Learn about Fluxa
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={handleConnect}
          className="w-full px-4 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Connect with Fluxa
        </button>
        <p className="text-xs text-muted-foreground text-center">
          SSO integration coming soon — clicking connect marks this step complete for now.
        </p>
      </div>
      <p className="text-xs text-muted-foreground mt-6">
        <Link href="/" className="hover:text-foreground underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
