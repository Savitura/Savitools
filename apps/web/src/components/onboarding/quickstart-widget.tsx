'use client';

import {
  countCompleted,
  isAllComplete,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, ChevronUp, Circle, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useOnboarding } from '@/hooks/use-onboarding';

export function QuickstartWidget() {
  const { progress, dismissed, hydrated, completeStep, dismiss } = useOnboarding();
  const [expanded, setExpanded] = useState(true);

  if (!hydrated || dismissed) return null;

  const completed = countCompleted(progress);
  const allDone = isAllComplete(progress);

  const handleStepClick = (stepId: OnboardingStepId) => {
    if (stepId === 'inspect') {
      completeStep('inspect');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-background shadow-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">Getting started</p>
          <p className="text-xs text-muted-foreground">
            {allDone ? '4/4 complete — nice work!' : `${completed}/4 complete`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label={expanded ? 'Collapse checklist' : 'Expand checklist'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Dismiss checklist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="max-h-64 overflow-y-auto p-2">
          {ONBOARDING_STEPS.map((step) => {
            const done = progress[step.id];
            return (
              <li key={step.id}>
                <Link
                  href={step.exampleHref}
                  onClick={() => handleStepClick(step.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/60',
                    done && 'text-muted-foreground',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn('truncate', done && 'line-through')}>{step.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
