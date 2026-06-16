'use client';

import {
  countCompleted,
  isAllComplete,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import { Check, ChevronRight, Circle } from 'lucide-react';
import Link from 'next/link';
import { useOnboarding } from '@/hooks/use-onboarding';

interface QuickstartChecklistProps {
  variant?: 'card' | 'compact';
  className?: string;
}

export function QuickstartChecklist({ variant = 'card', className }: QuickstartChecklistProps) {
  const { progress, hydrated, completeStep } = useOnboarding();

  if (!hydrated) return null;

  const completed = countCompleted(progress);
  const allDone = isAllComplete(progress);

  const handleStepClick = (stepId: OnboardingStepId) => {
    if (stepId === 'inspect') {
      completeStep('inspect');
    }
  };

  return (
    <div
      className={cn(
        variant === 'card' && 'rounded-lg border border-border p-6',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold">Quickstart checklist</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get to your first success in under 5 minutes.
          </p>
        </div>
        <span
          className={cn(
            'text-xs font-mono px-2 py-1 rounded',
            allDone ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {completed}/{ONBOARDING_STEPS.length} complete
        </span>
      </div>

      <ul className="space-y-2">
        {ONBOARDING_STEPS.map((step) => {
          const done = progress[step.id];
          return (
            <li key={step.id}>
              <Link
                href={step.exampleHref}
                onClick={() => handleStepClick(step.id)}
                className={cn(
                  'flex items-start gap-3 rounded-md p-3 text-left transition-colors',
                  'hover:bg-muted/60 border border-transparent hover:border-border',
                  done && 'opacity-70',
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {done ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn('text-sm block', done && 'line-through text-muted-foreground')}>
                    {step.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
