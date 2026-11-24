import {
  getLocalMinutesInTimezone,
  isWithinQuietHours,
  isValidTimezone,
  parseTimeMinutes,
} from './quiet-hours';

describe('quiet-hours helpers', () => {
  describe('isValidTimezone', () => {
    it.each(['UTC', 'America/New_York', 'Asia/Kolkata', 'Etc/GMT+5'])(
      'accepts the IANA timezone %s',
      (timezone) => {
        expect(isValidTimezone(timezone)).toBe(true);
      },
    );

    it.each(['', 'Not/AZone', 'Mars/Olympus'])('rejects the invalid timezone "%s"', (timezone) => {
      expect(isValidTimezone(timezone)).toBe(false);
    });
  });

  describe('parseTimeMinutes', () => {
    it.each([
      { time: '00:00', minutes: 0 },
      { time: '09:05', minutes: 545 },
      { time: '23:59', minutes: 1439 },
      { time: ' 22:00 ', minutes: 1320 },
    ])('parses "$time" as $minutes minutes', ({ time, minutes }) => {
      expect(parseTimeMinutes(time)).toBe(minutes);
    });

    it.each(['', '1:00', '24:00', '00:60', '09:0', '09:00:00'])(
      'rejects the malformed time "%s"',
      (time) => {
        expect(() => parseTimeMinutes(time)).toThrow(
          `Invalid time format "${time}", expected "HH:mm" in 24-hour format`,
        );
      },
    );
  });

  describe('getLocalMinutesInTimezone', () => {
    it.each([
      {
        date: '2026-06-15T00:30:00.000Z',
        timezone: 'UTC',
        minutes: 30,
      },
      {
        date: '2026-06-15T00:30:00.000Z',
        timezone: 'America/New_York',
        minutes: 1230,
      },
      {
        date: '2026-06-15T00:30:00.000Z',
        timezone: 'Asia/Kolkata',
        minutes: 360,
      },
      {
        date: '2026-03-08T06:30:00.000Z',
        timezone: 'America/New_York',
        minutes: 90,
      },
      {
        date: '2026-03-08T07:30:00.000Z',
        timezone: 'America/New_York',
        minutes: 210,
      },
      {
        date: '2026-11-01T05:30:00.000Z',
        timezone: 'America/New_York',
        minutes: 90,
      },
      {
        date: '2026-11-01T06:30:00.000Z',
        timezone: 'America/New_York',
        minutes: 90,
      },
    ])('returns $minutes for $date in $timezone', ({ date, timezone, minutes }) => {
      expect(getLocalMinutesInTimezone(new Date(date), timezone)).toBe(minutes);
    });

    it('propagates an invalid timezone as a RangeError', () => {
      expect(() =>
        getLocalMinutesInTimezone(new Date('2026-06-15T00:00:00.000Z'), 'Bad/Zone'),
      ).toThrow(RangeError);
    });

    it('propagates an invalid Date as a RangeError', () => {
      expect(() => getLocalMinutesInTimezone(new Date('not-a-date'), 'UTC')).toThrow(RangeError);
    });
  });

  describe('isWithinQuietHours', () => {
    const utc = (time: string) => new Date(`2026-06-15T${time}:00.000Z`);

    it.each([
      { time: '08:59', expected: false },
      { time: '09:00', expected: true },
      { time: '16:59', expected: true },
      { time: '17:00', expected: false },
      { time: '23:59', expected: false },
    ])('treats the daytime window 09:00-17:00 as half-open at $time', ({ time, expected }) => {
      expect(isWithinQuietHours(utc(time), 'UTC', '09:00', '17:00')).toBe(expected);
    });

    it.each([
      { time: '21:59', expected: false },
      { time: '22:00', expected: true },
      { time: '23:59', expected: true },
      { time: '00:00', expected: true },
      { time: '07:59', expected: true },
      { time: '08:00', expected: false },
    ])('treats the overnight window 22:00-08:00 as half-open at $time', ({ time, expected }) => {
      expect(isWithinQuietHours(utc(time), 'UTC', '22:00', '08:00')).toBe(expected);
    });

    it.each(['11:59', '12:00', '12:01'])(
      'returns false for equal start and end bounds at %s',
      (time) => {
        expect(isWithinQuietHours(utc(time), 'UTC', '12:00', '12:00')).toBe(false);
      },
    );

    it('ignores seconds when evaluating the local minute', () => {
      expect(
        isWithinQuietHours(new Date('2026-06-15T21:59:59.000Z'), 'UTC', '22:00', '08:00'),
      ).toBe(false);
      expect(
        isWithinQuietHours(new Date('2026-06-15T22:00:00.000Z'), 'UTC', '22:00', '08:00'),
      ).toBe(true);
    });

    it('falls back to UTC for an invalid timezone', () => {
      const inside = utc('23:30');
      const outside = utc('14:00');
      expect(isWithinQuietHours(inside, 'Bad/Zone', '22:00', '08:00')).toBe(true);
      expect(isWithinQuietHours(outside, 'Bad/Zone', '22:00', '08:00')).toBe(false);
      expect(isWithinQuietHours(inside, 'UTC', '22:00', '08:00')).toBe(true);
      expect(isWithinQuietHours(outside, 'UTC', '22:00', '08:00')).toBe(false);
    });

    it('still rejects malformed bounds when the timezone is invalid', () => {
      expect(() => isWithinQuietHours(utc('12:00'), 'Bad/Zone', '25:00', '08:00')).toThrow(
        'Invalid time format "25:00"',
      );
    });

    it('evaluates a half-hour timezone at its local boundary', () => {
      expect(
        isWithinQuietHours(new Date('2026-06-15T16:30:00.000Z'), 'Asia/Kolkata', '22:00', '08:00'),
      ).toBe(true);
      expect(
        isWithinQuietHours(new Date('2026-06-15T17:30:00.000Z'), 'Asia/Kolkata', '22:00', '08:00'),
      ).toBe(true);
      expect(
        isWithinQuietHours(new Date('2026-06-15T02:30:00.000Z'), 'Asia/Kolkata', '22:00', '08:00'),
      ).toBe(false);
    });

    it('applies winter offsets in America/New_York', () => {
      expect(
        isWithinQuietHours(
          new Date('2026-01-15T03:30:00.000Z'),
          'America/New_York',
          '22:00',
          '08:00',
        ),
      ).toBe(true);
      expect(
        isWithinQuietHours(
          new Date('2026-01-15T14:00:00.000Z'),
          'America/New_York',
          '22:00',
          '08:00',
        ),
      ).toBe(false);
    });

    it('uses the post-transition local time on a DST spring-forward day', () => {
      expect(
        isWithinQuietHours(
          new Date('2026-03-08T07:30:00.000Z'),
          'America/New_York',
          '22:00',
          '08:00',
        ),
      ).toBe(true);
      expect(
        isWithinQuietHours(
          new Date('2026-03-08T13:00:00.000Z'),
          'America/New_York',
          '22:00',
          '08:00',
        ),
      ).toBe(false);
    });
  });
});
