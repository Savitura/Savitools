import { act, renderHook } from '@testing-library/react';
import { useOnboarding } from '@/hooks/use-onboarding';
import {
  EMPTY_PROGRESS,
  ONBOARDING_DISMISSED_KEY,
  ONBOARDING_STORAGE_KEY,
  dismissOnboarding,
  markStepComplete,
} from '@/lib/onboarding';

describe('useOnboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('loads default progress and non-dismissed state when storage is empty', () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.hydrated).toBe(true);
    expect(result.current.dismissed).toBe(false);
    expect(result.current.progress).toEqual(EMPTY_PROGRESS);
  });

  it('hydrates persisted progress and dismissed state from localStorage', () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ inspect: true, simulate: true }),
    );
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, JSON.stringify('true'));

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.hydrated).toBe(true);
    expect(result.current.dismissed).toBe(true);
    expect(result.current.progress).toEqual({
      inspect: true,
      sandbox: false,
      simulate: true,
      fluxa: false,
    });
  });

  it('falls back to default progress when stored JSON is malformed or invalid', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '{not-valid-json');

    const { result } = renderHook(() => useOnboarding());
    expect(result.current.progress).toEqual(EMPTY_PROGRESS);

    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(['unexpected-array']));
    act(() => {
      result.current.sync();
    });
    expect(result.current.progress).toEqual(EMPTY_PROGRESS);
  });

  it('marks steps complete and persists updates to localStorage', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeStep('inspect');
    });

    expect(result.current.progress).toEqual({
      inspect: true,
      sandbox: false,
      simulate: false,
      fluxa: false,
    });
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) ?? '{}')).toEqual({
      inspect: true,
      sandbox: false,
      simulate: false,
      fluxa: false,
    });

    act(() => {
      result.current.completeStep('sandbox');
    });

    expect(result.current.progress).toEqual({
      inspect: true,
      sandbox: true,
      simulate: false,
      fluxa: false,
    });
  });

  it('persists dismissal state across hook remounts', () => {
    const first = renderHook(() => useOnboarding());
    expect(first.result.current.dismissed).toBe(false);

    act(() => {
      first.result.current.dismiss();
    });

    expect(first.result.current.dismissed).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_DISMISSED_KEY)).toBe(JSON.stringify('true'));
    first.unmount();

    const remounted = renderHook(() => useOnboarding());
    expect(remounted.result.current.dismissed).toBe(true);
  });

  it('synchronizes when external onboarding custom events or storage events fire', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      markStepComplete('fluxa');
    });
    expect(result.current.progress.fluxa).toBe(true);

    act(() => {
      dismissOnboarding();
    });
    expect(result.current.dismissed).toBe(true);

    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ inspect: true, sandbox: true, simulate: true, fluxa: true }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: ONBOARDING_STORAGE_KEY }));
    });
    expect(result.current.progress).toEqual({
      inspect: true,
      sandbox: true,
      simulate: true,
      fluxa: true,
    });
  });

  it('removes window event listeners on unmount', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnboarding());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('savitools-onboarding-update', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    removeSpy.mockRestore();
  });
});
