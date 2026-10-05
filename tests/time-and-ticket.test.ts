import { describe, it, expect } from 'vitest';
import {
  parseJakartaDateTime,
  getJakartaDateString,
  getJakartaTimeString,
  getJakartaDayOfWeek,
  startOfDayJakarta,
  endOfDayJakarta,
  addDaysJakarta,
  isSameDayJakarta,
  formatJakartaDisplayDate,
  formatJakartaDisplayTime,
} from '@/lib/time';
import { generateTicketCode } from '@/lib/ticket';

describe('Time and Timezone Helper (Asia/Jakarta)', () => {
  it('parses Jakarta date time correctly to UTC instant', () => {
    const date = parseJakartaDateTime('2026-10-06', '09:00');
    // 09:00 in UTC+7 is 02:00 in UTC
    expect(date.toISOString()).toBe('2026-10-06T02:00:00.000Z');
  });

  it('formats Date to Jakarta date string (YYYY-MM-DD)', () => {
    // 2026-10-05 20:00 UTC is 2026-10-06 03:00 in Jakarta (+7)
    const date = new Date('2026-10-05T20:00:00.000Z');
    expect(getJakartaDateString(date)).toBe('2026-10-06');
    expect(getJakartaTimeString(date)).toBe('03:00');
  });

  it('calculates correct day of week in Jakarta calendar', () => {
    // 2026-10-05 is Monday (1)
    const monday = parseJakartaDateTime('2026-10-05', '10:00');
    expect(getJakartaDayOfWeek(monday)).toBe(1);

    // 2026-10-11 is Sunday (0)
    const sunday = parseJakartaDateTime('2026-10-11', '10:00');
    expect(getJakartaDayOfWeek(sunday)).toBe(0);

    // 2026-10-10 is Saturday (6)
    const saturday = parseJakartaDateTime('2026-10-10', '10:00');
    expect(getJakartaDayOfWeek(saturday)).toBe(6);
  });

  it('calculates start and end of day in Jakarta', () => {
    const date = parseJakartaDateTime('2026-10-06', '14:30');
    const start = startOfDayJakarta(date);
    const end = endOfDayJakarta(date);

    expect(start.toISOString()).toBe('2026-10-05T17:00:00.000Z'); // 00:00 WIB
    expect(getJakartaDateString(start)).toBe('2026-10-06');
    expect(getJakartaTimeString(start)).toBe('00:00');

    expect(getJakartaDateString(end)).toBe('2026-10-06');
    expect(getJakartaTimeString(end)).toBe('23:59');
  });

  it('adds days in Jakarta calendar', () => {
    const start = parseJakartaDateTime('2026-10-05', '09:00');
    const nextWeek = addDaysJakarta(start, 7);
    expect(getJakartaDateString(nextWeek)).toBe('2026-10-12');
    expect(getJakartaTimeString(nextWeek)).toBe('09:00');
  });

  it('checks if two dates are same day in Jakarta', () => {
    const d1 = parseJakartaDateTime('2026-10-06', '01:00');
    const d2 = parseJakartaDateTime('2026-10-06', '23:00');
    const d3 = parseJakartaDateTime('2026-10-07', '00:01');

    expect(isSameDayJakarta(d1, d2)).toBe(true);
    expect(isSameDayJakarta(d1, d3)).toBe(false);
  });

  it('formats display date and time', () => {
    const date = parseJakartaDateTime('2026-10-06', '09:30');
    expect(formatJakartaDisplayTime(date)).toBe('09:30');
    const displayDate = formatJakartaDisplayDate(date);
    expect(displayDate.toLowerCase()).toContain('okt');
  });
});

describe('Ticket Code Generator', () => {
  it('generates ticket with correct prefix and format', () => {
    const code = generateTicketCode('BRB');
    expect(code).toMatch(/^BRB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  });

  it('does not contain ambiguous characters (0, O, 1, I)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTicketCode('BRB');
      const suffix = code.split('-')[1];
      expect(suffix).not.toMatch(/[0O1I]/);
    }
  });
});
