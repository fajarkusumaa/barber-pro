import { describe, it, expect } from 'vitest';
import {
  calculateAvailableSlots,
  calculateMergedSlots,
  getTimeGroup,
} from '@/server/booking/availability';
import { parseJakartaDateTime } from '@/lib/time';
import { bookingConfig } from '@/lib/config';

describe('Availability Service (Pure Functions)', () => {
  const targetDate = '2026-10-06'; // Tuesday (dayOfWeek = 2)
  const now = parseJakartaDateTime('2026-10-06', '08:00'); // 08:00 WIB

  const standardSchedules = [
    // Tuesday shifts: 09:00-12:00, 13:00-17:00 (12:00-13:00 is break)
    { dayOfWeek: 2, startTime: '09:00', endTime: '12:00' },
    { dayOfWeek: 2, startTime: '13:00', endTime: '17:00' },
  ];

  it('generates 30-min slots for working shifts respecting break time', () => {
    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate,
      schedules: standardSchedules,
      timeOffs: [],
      existingBookings: [],
      config: bookingConfig,
      now,
    });

    const timeStrings = slots.map((s) => s.timeString);

    // Morning shift 09:00-12:00 -> 09:00, 09:30, 10:00, 10:30, 11:00, 11:30 (6 slots)
    // Afternoon shift 13:00-17:00 -> 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30 (8 slots)
    // 12:00, 12:30 are break time so not present
    expect(timeStrings).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
    ]);
    expect(slots.length).toBe(14);
  });

  it('categorizes slots into morning, afternoon, and evening groups', () => {
    expect(getTimeGroup('09:00')).toBe('morning');
    expect(getTimeGroup('11:30')).toBe('morning');
    expect(getTimeGroup('12:00')).toBe('afternoon');
    expect(getTimeGroup('16:30')).toBe('afternoon');
    expect(getTimeGroup('17:00')).toBe('evening');
    expect(getTimeGroup('19:30')).toBe('evening');
  });

  it('filters out slots within minLeadMinutes from now', () => {
    // Current time is 09:15. With minLeadMinutes = 60, slots before 10:15 are filtered out
    const currentNow = parseJakartaDateTime('2026-10-06', '09:15');

    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate,
      schedules: standardSchedules,
      timeOffs: [],
      existingBookings: [],
      config: { ...bookingConfig, minLeadMinutes: 60 },
      now: currentNow,
    });

    const timeStrings = slots.map((s) => s.timeString);
    expect(timeStrings).not.toContain('09:00');
    expect(timeStrings).not.toContain('09:30');
    expect(timeStrings).not.toContain('10:00');
    expect(timeStrings).toContain('10:30');
    expect(timeStrings[0]).toBe('10:30');
  });

  it('removes slots overlapping with time off / leave / busy', () => {
    // Capster has time off from 10:00 to 11:30
    const timeOffs = [
      {
        startsAt: parseJakartaDateTime('2026-10-06', '10:00'),
        endsAt: parseJakartaDateTime('2026-10-06', '11:30'),
      },
    ];

    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate,
      schedules: standardSchedules,
      timeOffs,
      existingBookings: [],
      config: bookingConfig,
      now,
    });

    const timeStrings = slots.map((s) => s.timeString);
    expect(timeStrings).toContain('09:30');
    expect(timeStrings).not.toContain('10:00');
    expect(timeStrings).not.toContain('10:30');
    expect(timeStrings).not.toContain('11:00');
    expect(timeStrings).toContain('11:30');
  });

  it('removes slots overlapping with confirmed bookings', () => {
    // Active booking at 14:00 - 14:30
    const existingBookings = [
      {
        startsAt: parseJakartaDateTime('2026-10-06', '14:00'),
        endsAt: parseJakartaDateTime('2026-10-06', '14:30'),
        status: 'confirmed',
      },
    ];

    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate,
      schedules: standardSchedules,
      timeOffs: [],
      existingBookings,
      config: bookingConfig,
      now,
    });

    const timeStrings = slots.map((s) => s.timeString);
    expect(timeStrings).toContain('13:30');
    expect(timeStrings).not.toContain('14:00');
    expect(timeStrings).toContain('14:30');
  });

  it('allows slots from cancelled bookings (cancelled booking does not block)', () => {
    const existingBookings = [
      {
        startsAt: parseJakartaDateTime('2026-10-06', '14:00'),
        endsAt: parseJakartaDateTime('2026-10-06', '14:30'),
        status: 'cancelled',
      },
    ];

    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate,
      schedules: standardSchedules,
      timeOffs: [],
      existingBookings,
      config: bookingConfig,
      now,
    });

    const timeStrings = slots.map((s) => s.timeString);
    expect(timeStrings).toContain('14:00');
  });

  it('returns empty array if target date is in the past', () => {
    const pastDate = '2026-10-05';
    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate: pastDate,
      schedules: standardSchedules,
      timeOffs: [],
      existingBookings: [],
      config: bookingConfig,
      now: parseJakartaDateTime('2026-10-06', '08:00'),
    });

    expect(slots).toEqual([]);
  });

  it('returns empty array if target date exceeds maxDaysAhead', () => {
    const futureDate = '2026-10-20'; // > 7 days ahead
    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate: futureDate,
      schedules: standardSchedules,
      timeOffs: [],
      existingBookings: [],
      config: { ...bookingConfig, maxDaysAhead: 7 },
      now: parseJakartaDateTime('2026-10-06', '08:00'),
    });

    expect(slots).toEqual([]);
  });

  it('returns empty array if capster has no schedule on that day', () => {
    // Schedule only on Wednesday (3), target date is Tuesday (2)
    const wednesdaySchedule = [{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }];

    const slots = calculateAvailableSlots({
      capsterId: 1,
      targetDate,
      schedules: wednesdaySchedule,
      timeOffs: [],
      existingBookings: [],
      config: bookingConfig,
      now,
    });

    expect(slots).toEqual([]);
  });

  it('merges slots correctly for "Siapa saja" across multiple capsters', () => {
    // Capster 1 slots
    const capster1Slots = [
      { startsAt: parseJakartaDateTime('2026-10-06', '09:00'), endsAt: parseJakartaDateTime('2026-10-06', '09:30'), timeString: '09:00', group: 'morning' as const },
      { startsAt: parseJakartaDateTime('2026-10-06', '09:30'), endsAt: parseJakartaDateTime('2026-10-06', '10:00'), timeString: '09:30', group: 'morning' as const },
    ];

    // Capster 2 slots
    const capster2Slots = [
      { startsAt: parseJakartaDateTime('2026-10-06', '09:30'), endsAt: parseJakartaDateTime('2026-10-06', '10:00'), timeString: '09:30', group: 'morning' as const },
      { startsAt: parseJakartaDateTime('2026-10-06', '10:00'), endsAt: parseJakartaDateTime('2026-10-06', '10:30'), timeString: '10:00', group: 'morning' as const },
    ];

    const slotsMap = new Map<number, any>([
      [1, capster1Slots],
      [2, capster2Slots],
    ]);

    const merged = calculateMergedSlots(slotsMap);

    expect(merged.length).toBe(3);
    expect(merged.map((m) => m.timeString)).toEqual(['09:00', '09:30', '10:00']);

    // 09:00 only capster 1
    expect(merged.find((m) => m.timeString === '09:00')?.availableCapsterIds).toEqual([1]);
    // 09:30 both capster 1 and capster 2
    expect(merged.find((m) => m.timeString === '09:30')?.availableCapsterIds).toEqual([1, 2]);
    // 10:00 only capster 2
    expect(merged.find((m) => m.timeString === '10:00')?.availableCapsterIds).toEqual([2]);
  });
});
