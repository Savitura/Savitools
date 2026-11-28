import { EXAMPLE_TX_HASH } from './examples';
import { BROWSER_STORAGE_KEYS, safeGetItem, safeSetItem } from './browser-storage';

export const ONBOARDING_STORAGE_KEY = BROWSER_STORAGE_KEYS.ONBOARDING;
export const ONBOARDING_DISMISSED_KEY = BROWSER_STORAGE_KEYS.ONBOARDING_DISMISSED;

export type OnboardingStepId = 'inspect' | 'sandbox' | 'simulate' | 'fluxa';

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  description: string;
  href: string;
  exampleHref: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'inspect',
    label: 'Inspect a Stellar transaction',
    description: 'Decode a known testnet transaction in one click.',
    href: '/inspector',
    exampleHref: `/inspector?hash=${EXAMPLE_TX_HASH}&example=1`,
  },
  {
    id: 'sandbox',
    label: 'Create a sandbox wallet',
    description: 'Generate and auto-fund a testnet keypair.',
    href: '/sandbox',
    exampleHref: '/sandbox?action=create&example=1',
  },
  {
    id: 'simulate',
    label: 'Simulate a payment route',
    description: 'Preview an XLM → USDC path payment.',
    href: '/simulator',
    exampleHref: '/simulator?source=native&destination=USDC&example=1',
  },
  {
    id: 'fluxa',
    label: 'Connect your Fluxa account',
    description: 'Link Fluxa to use your API keys in SaviTools.',
    href: '/auth/fluxa',
    exampleHref: '/auth/fluxa',
  },
];

export type OnboardingProgress = Record<OnboardingStepId, boolean>;

export const EMPTY_PROGRESS: OnboardingProgress = {
  inspect: false,
  sandbox: false,
  simulate: false,
  fluxa: false,
};

export function getDefaultProgress(): OnboardingProgress {
  return { ...EMPTY_PROGRESS };
}

export function countCompleted(progress: OnboardingProgress): number {
  return ONBOARDING_STEPS.filter((step) => progress[step.id]).length;
}

export function isAllComplete(progress: OnboardingProgress): boolean {
  return countCompleted(progress) === ONBOARDING_STEPS.length;
}

export function readProgress(): OnboardingProgress {
  const parsed = safeGetItem<unknown>(ONBOARDING_STORAGE_KEY, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return getDefaultProgress();
  }
  return { ...EMPTY_PROGRESS, ...(parsed as Partial<OnboardingProgress>) };
}

export function writeProgress(progress: OnboardingProgress): void {
  safeSetItem(ONBOARDING_STORAGE_KEY, progress);
}

export function markStepComplete(stepId: OnboardingStepId): OnboardingProgress {
  const progress = readProgress();
  progress[stepId] = true;
  writeProgress(progress);
  window.dispatchEvent(new CustomEvent('savitools-onboarding-update'));
  return progress;
}

export function isDismissed(): boolean {
  const val = safeGetItem<unknown>(ONBOARDING_DISMISSED_KEY, false);
  return val === true || val === 'true';
}

export function dismissOnboarding(): void {
  const result = safeSetItem(ONBOARDING_DISMISSED_KEY, true);
  if (result.success && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savitools-onboarding-update'));
  }
}
