import {
  ONBOARDING_DISMISSED_KEY,
  ONBOARDING_STORAGE_KEY,
  countCompleted,
  dismissOnboarding,
  getDefaultProgress,
  isAllComplete,
  isDismissed,
  markStepComplete,
  readProgress,
  writeProgress,
} from '@/lib/onboarding';

describe('onboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('derives progress and completion from the fixed step list', () => {
    const progress = getDefaultProgress();
    expect(Object.keys(progress)).toHaveLength(4);
    expect(countCompleted(progress)).toBe(0);
    expect(isAllComplete(progress)).toBe(false);

    progress.inspect = true;
    progress.sandbox = true;
    expect(countCompleted(progress)).toBe(2);
    expect(
      isAllComplete({
        inspect: true,
        sandbox: true,
        simulate: true,
        fluxa: true,
      }),
    ).toBe(true);
  });

  it('returns default progress when stored JSON is corrupted or not an object', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '{not-json');
    expect(readProgress()).toEqual(getDefaultProgress());

    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '["inspect"]');
    expect(readProgress()).toEqual(getDefaultProgress());

    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '42');
    expect(readProgress()).toEqual(getDefaultProgress());
  });

  it('fills missing flags from defaults and preserves known flags', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ sandbox: true }));

    expect(readProgress()).toEqual({
      inspect: false,
      sandbox: true,
      simulate: false,
      fluxa: false,
    });
  });

  it('falls back to defaults when storage getItem or setItem throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(readProgress()).toEqual(getDefaultProgress());

    jest.restoreAllMocks();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(() => writeProgress({ ...getDefaultProgress(), inspect: true })).not.toThrow();
  });

  it('marks steps complete, persists progress, and dispatches an update event', () => {
    const onUpdate = jest.fn();
    window.addEventListener('savitools-onboarding-update', onUpdate);

    const progress = markStepComplete('inspect');

    expect(progress.inspect).toBe(true);
    expect(readProgress().inspect).toBe(true);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    window.removeEventListener('savitools-onboarding-update', onUpdate);
  });

  it('reads the dismissed flag in both boolean and string forms', () => {
    expect(isDismissed()).toBe(false);

    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, JSON.stringify(true));
    expect(isDismissed()).toBe(true);

    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    expect(isDismissed()).toBe(true);

    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'false');
    expect(isDismissed()).toBe(false);
  });

  it('dismisses onboarding and dispatches an update event', () => {
    const onUpdate = jest.fn();
    window.addEventListener('savitools-onboarding-update', onUpdate);

    dismissOnboarding();

    expect(window.localStorage.getItem(ONBOARDING_DISMISSED_KEY)).toBe(JSON.stringify('true'));
    expect(isDismissed()).toBe(true);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    window.removeEventListener('savitools-onboarding-update', onUpdate);
  });
});
