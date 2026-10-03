import { expect, it } from 'vitest';
import { scheduledDateTime } from '../utils/time.js';

it('converts São Paulo to UTC independently of machine timezone', () => {
  expect(scheduledDateTime('2026-10-02', '12:20').toISOString()).toBe('2026-10-02T15:20:00.000Z');
  expect(scheduledDateTime('2026-10-02', '23:59').toISOString()).toBe('2026-10-03T02:59:00.000Z');
});
it.each([['2026-02-29', '12:00'], ['2026-13-01', '12:00'], ['2026-01-01', '9:30'], ['2026-01-01', '12:60'], ['2018-11-04', '00:30'], ['2019-02-16', '23:30']])('rejects invalid or ambiguous time %s %s', (date, time) => {
  expect(() => scheduledDateTime(date, time)).toThrow();
});
it('accepts leap years', () => {
  expect(scheduledDateTime('2028-02-29', '12:00').toISOString()).toBe('2028-02-29T15:00:00.000Z');
});
