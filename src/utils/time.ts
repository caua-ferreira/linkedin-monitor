import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { SafeError } from './errors.js';

export const TIMEZONE = 'America/Sao_Paulo';

export function scheduledDateTime(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new SafeError('INVALID_SCHEDULE');
  }
  const local = `${date}T${time}:00`;
  const instant = fromZonedTime(local, TIMEZONE);
  if (Number.isNaN(instant.getTime()) || formatInTimeZone(instant, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss") !== local) {
    throw new SafeError('INVALID_SCHEDULE');
  }
  // Horas repetidas durante transições históricas também são ambíguas.
  for (const delta of [-3_600_000, 3_600_000]) {
    if (formatInTimeZone(new Date(instant.getTime() + delta), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss") === local) {
      throw new SafeError('AMBIGUOUS_SCHEDULE');
    }
  }
  return instant;
}
