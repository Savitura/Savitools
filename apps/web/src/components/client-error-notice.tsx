'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { subscribeToClientErrors, type ClientErrorReport } from '@/lib/client-error-reporter';

export function ClientErrorNotice() {
  const [report, setReport] = useState<ClientErrorReport | null>(null);

  useEffect(
    () =>
      subscribeToClientErrors((next) => {
        if (next.userMessage) setReport(next);
      }),
    [],
  );

  if (!report?.userMessage) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 shadow-lg backdrop-blur"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <p className="font-medium">
          {report.action ? `${report.action}: ` : ''}
          {report.userMessage}
        </p>
        <p className="text-xs text-amber-700/80">
          Reported by {report.area}. You can safely dismiss this notice.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => setReport(null)}
        className="rounded p-0.5 text-amber-700 hover:bg-amber-500/20"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
