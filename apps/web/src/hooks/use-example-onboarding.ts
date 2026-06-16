'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { markStepComplete, type OnboardingStepId } from '@/lib/onboarding';

export function useExampleOnboarding(stepId: OnboardingStepId) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('example') === '1') {
      markStepComplete(stepId);
    }
  }, [searchParams, stepId]);
}
