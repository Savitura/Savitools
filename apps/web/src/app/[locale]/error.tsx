'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client-error-reporter';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      area: 'app',
      action: 'render-error',
      details: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Something went wrong!</h2>
        <p className="text-muted-foreground text-sm">
          An unexpected error occurred while loading this page.
        </p>
        <div>
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
