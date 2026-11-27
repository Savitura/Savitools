import { renderHook } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import {
  EMPTY_PROGRESS,
  ONBOARDING_STORAGE_KEY,
  readProgress,
  type OnboardingStepId,
} from '@/lib/onboarding';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

describe('useExampleOnboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseSearchParams.mockReset();
  });

  it('marks the given onboarding step complete when ?example=1 is present', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('hash=abc123&example=1') as ReturnType<typeof useSearchParams>,
    );
    const updateListener = jest.fn();
    window.addEventListener('savitools-onboarding-update', updateListener);

    renderHook(() => useExampleOnboarding('inspect'));

    expect(readProgress()).toEqual({
      ...EMPTY_PROGRESS,
      inspect: true,
    });
    expect(updateListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('savitools-onboarding-update', updateListener);
  });

  it('does not mark any step complete when the example query param is absent', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('hash=abc123') as ReturnType<typeof useSearchParams>,
    );

    renderHook(() => useExampleOnboarding('sandbox'));

    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    expect(readProgress()).toEqual(EMPTY_PROGRESS);
  });

  it.each(['0', 'true', '2', ''])('ignores example=%s values other than "1"', (value) => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(`example=${value}`) as ReturnType<typeof useSearchParams>,
    );

    renderHook(() => useExampleOnboarding('simulate'));

    expect(readProgress()).toEqual(EMPTY_PROGRESS);
  });

  it('triggers completion when searchParams updates to include example=1 or stepId changes', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('') as ReturnType<typeof useSearchParams>,
    );

    const { rerender } = renderHook(
      ({ stepId }: { stepId: OnboardingStepId }) => useExampleOnboarding(stepId),
      { initialProps: { stepId: 'sandbox' } },
    );

    expect(readProgress()).toEqual(EMPTY_PROGRESS);

    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('example=1') as ReturnType<typeof useSearchParams>,
    );
    rerender({ stepId: 'sandbox' });
    expect(readProgress().sandbox).toBe(true);

    rerender({ stepId: 'simulate' });
    expect(readProgress()).toEqual({
      inspect: false,
      sandbox: true,
      simulate: true,
      fluxa: false,
    });
  });
});
