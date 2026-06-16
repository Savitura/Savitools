'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dismissOnboarding,
  getDefaultProgress,
  isDismissed,
  markStepComplete,
  readProgress,
  type OnboardingProgress,
  type OnboardingStepId,
} from '@/lib/onboarding';

export function useOnboarding() {
  const [progress, setProgress] = useState<OnboardingProgress>(getDefaultProgress);
  const [dismissed, setDismissed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const sync = useCallback(() => {
    setProgress(readProgress());
    setDismissed(isDismissed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    sync();
    const handler = () => sync();
    window.addEventListener('savitools-onboarding-update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('savitools-onboarding-update', handler);
      window.removeEventListener('storage', handler);
    };
  }, [sync]);

  const completeStep = useCallback((stepId: OnboardingStepId) => {
    setProgress(markStepComplete(stepId));
  }, []);

  const dismiss = useCallback(() => {
    dismissOnboarding();
    setDismissed(true);
  }, []);

  return { progress, dismissed, hydrated, completeStep, dismiss, sync };
}
