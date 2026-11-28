import { renderHook } from '@testing-library/react';
import { useFormatters } from '@/lib/formatters';

jest.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      'time.now': 'now',
      'time.secondsAgo': '{count} seconds ago',
      'time.minutesAgo': '{count} minutes ago',
      'time.hoursAgo': '{count} hours ago',
      'time.daysAgo': '{count} days ago',
    };
    const template = messages[key] ?? key;
    return template.replace('{count}', String(params?.count ?? ''));
  },
}));

function setup() {
  return renderHook(() => useFormatters()).result.current;
}

describe('useFormatters', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats numbers, currency, and percentages with the active locale', () => {
    const formatters = setup();

    expect(formatters.formatNumber(1234.5)).toBe('1,234.5');
    expect(formatters.formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatters.formatCurrency(10, 'EUR')).toBe('€10.00');
    expect(formatters.formatPercent(0.125)).toBe('13%');
    expect(
      formatters.formatPercent(0.125, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    ).toBe('12.5%');
  });

  it('formats dates from Date objects, ISO strings, and timestamps', () => {
    const formatters = setup();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    };
    const expected = 'Jan 2, 2026';

    expect(formatters.formatDate(new Date('2026-01-02T03:04:05Z'), options)).toBe(expected);
    expect(formatters.formatDate('2026-01-02T03:04:05Z', options)).toBe(expected);
    expect(formatters.formatDate(Date.UTC(2026, 0, 2, 3, 4, 5), options)).toBe(expected);
  });

  it('formats relative times for now, seconds, minutes, hours, and days', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-10T12:00:00Z'));
    const formatters = setup();
    const now = Date.now();

    expect(formatters.formatRelativeTime(new Date(now - 2_000))).toBe('now');
    expect(formatters.formatRelativeTime(new Date(now - 45_000))).toBe('45 seconds ago');
    expect(formatters.formatRelativeTime(new Date(now - 5 * 60_000))).toBe('5 minutes ago');
    expect(formatters.formatRelativeTime(new Date(now - 3 * 3_600_000))).toBe('3 hours ago');
    expect(formatters.formatRelativeTime(new Date(now - 2 * 86_400_000))).toBe('2 days ago');
  });

  it('converts stroops to XLM for numeric and string inputs', () => {
    const formatters = setup();

    expect(formatters.formatStellarAmount(10_000_000)).toBe('1 XLM');
    expect(formatters.formatStellarAmount('10000000')).toBe('1 XLM');
    expect(formatters.formatStellarAmount(0)).toBe('0 XLM');
    expect(formatters.formatStellarAmount(1)).toBe('0.0000001 XLM');
    expect(formatters.formatStellarAmount(123_456_789)).toBe('12.3456789 XLM');
  });

  it('honors showCode and precision options for Stellar amounts', () => {
    const formatters = setup();

    expect(formatters.formatStellarAmount(10_000_000, { showCode: false })).toBe('1');
    expect(formatters.formatStellarAmount(123_456_789, { precision: 2 })).toBe('12.35 XLM');
  });

  it('preserves the documented fallback for unparseable amount strings', () => {
    const formatters = setup();

    expect(formatters.formatStellarAmount('not-a-number')).toBe('NaN XLM');
  });

  it('formats file sizes across B, KB, MB, and GB', () => {
    const formatters = setup();

    expect(formatters.formatFileSize(0)).toBe('0 B');
    expect(formatters.formatFileSize(512)).toBe('512 B');
    expect(formatters.formatFileSize(1024)).toBe('1 KB');
    expect(formatters.formatFileSize(1536)).toBe('1.5 KB');
    expect(formatters.formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatters.formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2 GB');
  });
});
