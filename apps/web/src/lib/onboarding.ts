import { EXAMPLE_TX_HASH } from './examples';

export const ONBOARDING_STORAGE_KEY = 'savitools_onboarding_progress';
export const ONBOARDING_DISMISSED_KEY = 'savitools_onboarding_dismissed';

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
  if (typeof window === 'undefined') return getDefaultProgress();
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return getDefaultProgress();
    return { ...EMPTY_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return getDefaultProgress();
  }
}

export function writeProgress(progress: OnboardingProgress): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress));
}

export function markStepComplete(stepId: OnboardingStepId): OnboardingProgress {
  const progress = readProgress();
  progress[stepId] = true;
  writeProgress(progress);
  window.dispatchEvent(new CustomEvent('savitools-onboarding-update'));
  return progress;
}

export function isDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
}

export function dismissOnboarding(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
  window.dispatchEvent(new CustomEvent('savitools-onboarding-update'));
}
