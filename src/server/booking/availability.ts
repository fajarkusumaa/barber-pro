import 'server-only';
import {
  parseJakartaDateTime,
  getJakartaDateString,
  getJakartaTimeString,
  getJakartaDayOfWeek,
  startOfDayJakarta,
  addDaysJakarta,
} from '@/lib/time';
import { bookingConfig, BookingConfig } from '@/lib/config';
import { db as defaultDb, Database, capsters, capsterSchedules, timeOffs, bookings } from '@/db';
import { eq, and, ne, gte, lte } from 'drizzle-orm';

export type TimeGroup = 'morning' | 'afternoon' | 'evening';

export interface TimeSlot {
  startsAt: Date;
  endsAt: Date;
  timeString: string; // 'HH:mm'
  group: TimeGroup;
}

export interface MergedTimeSlot extends TimeSlot {
  availableCapsterIds: number[];
}

export interface CalculateSlotsParams {
  capsterId: number;
  targetDate: string; // 'YYYY-MM-DD'
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[];
  timeOffs: { startsAt: Date; endsAt: Date }[];
  existingBookings: { startsAt: Date; endsAt: Date; status: string }[];
  config?: BookingConfig;
  now?: Date;
}

export function getTimeGroup(timeString: string): TimeGroup {
  const hour = parseInt(timeString.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Pure function to calculate available slots for a single capster on a given date.
 */
export function calculateAvailableSlots({
  targetDate,
  schedules,
  timeOffs: capsterTimeOffs,
  existingBookings,
  config = bookingConfig,
  now = new Date(),
}: CalculateSlotsParams): TimeSlot[] {
  // 1. Verify target date is within [today, today + maxDaysAhead]
  const todayStr = getJakartaDateString(now);
  const targetDayStart = parseJakartaDateTime(targetDate, '00:00:00');
  const todayDayStart = parseJakartaDateTime(todayStr, '00:00:00');
  const maxDayLimit = addDaysJakarta(todayDayStart, config.maxDaysAhead);

  if (targetDayStart < todayDayStart || targetDayStart > maxDayLimit) {
    return [];
  }

  // 2. Filter schedules matching the day of week for targetDate in Jakarta
  const targetDayOfWeek = getJakartaDayOfWeek(targetDayStart);
  const daySchedules = schedules.filter((s) => s.dayOfWeek === targetDayOfWeek);

  if (daySchedules.length === 0) {
    return [];
  }

  // Active bookings that are not cancelled
  const activeBookings = existingBookings.filter((b) => b.status !== 'cancelled');

  const minLeadTime = new Date(now.getTime() + config.minLeadMinutes * 60 * 1000);
  const bufferMs = config.bufferMinutes * 60 * 1000;
  const durationMs = config.defaultDurationMinutes * 60 * 1000;
  const intervalMs = config.slotIntervalMinutes * 60 * 1000;

  const slots: TimeSlot[] = [];
  const addedTimes = new Set<string>();

  for (const schedule of daySchedules) {
    const windowStart = parseJakartaDateTime(targetDate, schedule.startTime);
    const windowEnd = parseJakartaDateTime(targetDate, schedule.endTime);

    let currentSlotStart = new Date(windowStart.getTime());

    while (currentSlotStart.getTime() + durationMs <= windowEnd.getTime()) {
      const currentSlotEnd = new Date(currentSlotStart.getTime() + durationMs);
      const timeStr = getJakartaTimeString(currentSlotStart);

      // Check lead time requirement
      const passesLeadTime = currentSlotStart.getTime() >= minLeadTime.getTime();

      if (passesLeadTime && !addedTimes.has(timeStr)) {
        // Check overlap with timeOffs
        const overlapsTimeOff = capsterTimeOffs.some((to) => {
          return (
            currentSlotStart.getTime() < new Date(to.endsAt).getTime() &&
            currentSlotEnd.getTime() > new Date(to.startsAt).getTime()
          );
        });

        // Check overlap with existing bookings (including buffer)
        const overlapsBooking = activeBookings.some((b) => {
          const bookingStart = new Date(b.startsAt).getTime();
          const bookingEndWithBuffer = new Date(b.endsAt).getTime() + bufferMs;
          return (
            currentSlotStart.getTime() < bookingEndWithBuffer &&
            currentSlotEnd.getTime() > bookingStart
          );
        });

        if (!overlapsTimeOff && !overlapsBooking) {
          slots.push({
            startsAt: currentSlotStart,
            endsAt: currentSlotEnd,
            timeString: timeStr,
            group: getTimeGroup(timeStr),
          });
          addedTimes.add(timeStr);
        }
      }

      currentSlotStart = new Date(currentSlotStart.getTime() + intervalMs);
    }
  }

  // Sort slots chronologically
  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return slots;
}

/**
 * Pure function to merge slots across multiple capsters for "Siapa saja" (Anyone).
 */
export function calculateMergedSlots(
  capsterSlotsMap: Map<number, TimeSlot[]>
): MergedTimeSlot[] {
  const mergedMap = new Map<string, MergedTimeSlot>();

  for (const [capsterId, slots] of capsterSlotsMap.entries()) {
    for (const slot of slots) {
      const existing = mergedMap.get(slot.timeString);
      if (existing) {
        if (!existing.availableCapsterIds.includes(capsterId)) {
          existing.availableCapsterIds.push(capsterId);
        }
      } else {
        mergedMap.set(slot.timeString, {
          ...slot,
          availableCapsterIds: [capsterId],
        });
      }
    }
  }

  const result = Array.from(mergedMap.values());
  result.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return result;
}

/**
 * Service: Fetch capster availability from database for a specific date.
 */
export async function getCapsterAvailability(
  params: {
    capsterId: number;
    targetDate: string; // 'YYYY-MM-DD'
    config?: BookingConfig;
    now?: Date;
  },
  db: Database = defaultDb
): Promise<TimeSlot[]> {
  const { capsterId, targetDate, config = bookingConfig, now = new Date() } = params;

  const targetDayStart = parseJakartaDateTime(targetDate, '00:00:00');
  const targetDayEnd = parseJakartaDateTime(targetDate, '23:59:59');

  // Fetch schedules for this capster
  const schedules = await db
    .select()
    .from(capsterSchedules)
    .where(eq(capsterSchedules.capsterId, capsterId));

  // Fetch time offs overlapping target date
  const timeOffList = await db
    .select()
    .from(timeOffs)
    .where(
      and(
        eq(timeOffs.capsterId, capsterId),
        gte(timeOffs.endsAt, targetDayStart),
        lte(timeOffs.startsAt, targetDayEnd)
      )
    );

  // Fetch bookings overlapping target date
  const bookingList = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.capsterId, capsterId),
        ne(bookings.status, 'cancelled'),
        gte(bookings.endsAt, targetDayStart),
        lte(bookings.startsAt, targetDayEnd)
      )
    );

  return calculateAvailableSlots({
    capsterId,
    targetDate,
    schedules,
    timeOffs: timeOffList,
    existingBookings: bookingList,
    config,
    now,
  });
}

/**
 * Service: Fetch merged availability for all active capsters at a branch ("Siapa saja").
 */
export async function getAvailableSlotsForAny(
  params: {
    branchId: number;
    targetDate: string; // 'YYYY-MM-DD'
    config?: BookingConfig;
    now?: Date;
  },
  db: Database = defaultDb
): Promise<MergedTimeSlot[]> {
  const { branchId, targetDate, config = bookingConfig, now = new Date() } = params;

  const activeCapsters = await db
    .select()
    .from(capsters)
    .where(and(eq(capsters.branchId, branchId), eq(capsters.isActive, true)));

  const capsterSlotsMap = new Map<number, TimeSlot[]>();

  for (const capster of activeCapsters) {
    const slots = await getCapsterAvailability(
      {
        capsterId: capster.id,
        targetDate,
        config,
        now,
      },
      db
    );
    capsterSlotsMap.set(capster.id, slots);
  }

  return calculateMergedSlots(capsterSlotsMap);
}

/**
 * Service: Get capsters who have at least one free slot on the given date.
 */
export async function getAvailableCapstersForDate(
  params: {
    branchId: number;
    targetDate: string; // 'YYYY-MM-DD'
    config?: BookingConfig;
    now?: Date;
  },
  db: Database = defaultDb
): Promise<{ id: number; name: string; availableSlotsCount: number }[]> {
  const { branchId, targetDate, config = bookingConfig, now = new Date() } = params;

  const activeCapsters = await db
    .select()
    .from(capsters)
    .where(and(eq(capsters.branchId, branchId), eq(capsters.isActive, true)));

  const result: { id: number; name: string; availableSlotsCount: number }[] = [];

  for (const capster of activeCapsters) {
    const slots = await getCapsterAvailability(
      {
        capsterId: capster.id,
        targetDate,
        config,
        now,
      },
      db
    );

    if (slots.length > 0) {
      result.push({
        id: capster.id,
        name: capster.name,
        availableSlotsCount: slots.length,
      });
    }
  }

  return result;
}
