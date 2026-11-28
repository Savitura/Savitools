import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientErrorNotice } from '@/components/client-error-notice';
import {
  reportClientError,
  reportClientWarning,
  subscribeToClientErrors,
  type ClientErrorReport,
} from '@/lib/client-error-reporter';

describe('client-error-reporter', () => {
  let reports: ClientErrorReport[];
  let unsubscribe: () => void;

  beforeEach(() => {
    reports = [];
    unsubscribe = subscribeToClientErrors((report) => reports.push(report));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    unsubscribe();
    jest.restoreAllMocks();
  });

  it('normalizes Error instances into structured reports', () => {
    const error = new Error('boom');
    const report = reportClientError(error, {
      area: 'unit-test',
      action: 'run',
      userMessage: 'Try again.',
      details: { attempt: 2 },
    });

    expect(report).toMatchObject({
      severity: 'error',
      area: 'unit-test',
      action: 'run',
      message: 'boom',
      userMessage: 'Try again.',
      details: { attempt: 2 },
      error: { name: 'Error', message: 'boom' },
    });
    expect(reports).toEqual([report]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('unit-test:run'), report);
  });

  it('normalizes strings and non-Error objects without throwing', () => {
    const stringReport = reportClientError('plain failure', { area: 'unit-test' });
    const objectReport = reportClientError({ code: 500 }, { area: 'unit-test' });

    expect(stringReport.error).toEqual({ name: 'Error', message: 'plain failure' });
    expect(objectReport.message).toBe('An unexpected client error occurred.');
  });

  it('logs warnings through the warn severity and console.warn', () => {
    const report = reportClientWarning('Invalid stored data', {
      area: 'storage',
      action: 'hydrate',
    });

    expect(report.severity).toBe('warn');
    expect(report.message).toBe('Invalid stored data');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('client-warn:storage:hydrate'),
      report,
    );
    expect(reports).toEqual([report]);
  });

  it('stops notifying after unsubscribe', () => {
    unsubscribe();
    reportClientError(new Error('ignored'), { area: 'unit-test' });

    expect(reports).toEqual([]);
  });

  it('shows only actionable reports in the global notice and allows dismissal', async () => {
    const user = userEvent.setup();
    render(<ClientErrorNotice />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      reportClientError(new Error('internal'), { area: 'unit-test', action: 'silent' });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      reportClientWarning('Saved data could not be read', {
        area: 'storage',
        action: 'hydrate',
        userMessage: 'Review your saved data.',
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('hydrate: Review your saved data.');
    expect(screen.getByRole('alert')).toHaveTextContent('Reported by storage.');

    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
