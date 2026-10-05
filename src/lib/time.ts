export const TIMEZONE = 'Asia/Jakarta';


/**
 * Parses a date string (YYYY-MM-DD) and a time string (HH:mm or HH:mm:ss) in Asia/Jakarta timezone,
 * returning a standard JavaScript Date (which represents the exact instant in UTC).
 */
export function parseJakartaDateTime(dateStr: string, timeStr: string): Date {
  const cleanTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const isoString = `${dateStr}T${cleanTime}+07:00`;
  return new Date(isoString);
}

/**
 * Returns the YYYY-MM-DD representation of a Date in Asia/Jakarta.
 */
export function getJakartaDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Returns the HH:mm representation of a Date in Asia/Jakarta.
 */
export function getJakartaTimeString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Returns the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday) in Asia/Jakarta.
 */
export function getJakartaDayOfWeek(date: Date): number {
  const dateStr = getJakartaDateString(date); // YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  // UTC date with the Jakarta calendar values gives reliable day-of-week without host offset interference
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Returns the start of the day (00:00:00.000) in Asia/Jakarta as a Date.
 */
export function startOfDayJakarta(date: Date): Date {
  const dateStr = getJakartaDateString(date);
  return parseJakartaDateTime(dateStr, '00:00:00');
}

/**
 * Returns the end of the day (23:59:59.999) in Asia/Jakarta as a Date.
 */
export function endOfDayJakarta(date: Date): Date {
  const dateStr = getJakartaDateString(date);
  const startNextDay = parseJakartaDateTime(dateStr, '24:00:00');
  return new Date(startNextDay.getTime() - 1);
}

/**
 * Adds days to a date within the Asia/Jakarta calendar.
 */
export function addDaysJakarta(date: Date, days: number): Date {
  const dateStr = getJakartaDateString(date);
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  const nextDateStr = d.toISOString().slice(0, 10);
  const timeStr = getJakartaTimeString(date);
  return parseJakartaDateTime(nextDateStr, timeStr);
}

/**
 * Checks if two dates are on the same calendar day in Asia/Jakarta.
 */
export function isSameDayJakarta(dateA: Date, dateB: Date): boolean {
  return getJakartaDateString(dateA) === getJakartaDateString(dateB);
}

/**
 * Formats a date for human display in Indonesian format.
 * e.g., "Senin, 06 Okt 2026"
 */
export function formatJakartaDisplayDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return formatter.format(date);
}

/**
 * Formats a date time for human display.
 * e.g., "09:00"
 */
export function formatJakartaDisplayTime(date: Date): string {
  return getJakartaTimeString(date);
}
