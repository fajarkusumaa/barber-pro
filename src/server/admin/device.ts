import 'server-only';
import { and, asc, eq, gt, lt, ne, gte } from 'drizzle-orm';
import { db as defaultDb, Database, bookings, capsters, capsterSchedules, timeOffs } from '@/db';
import {
  endOfDayJakarta,
  getJakartaDateString,
  getJakartaDayOfWeek,
  parseJakartaDateTime,
  startOfDayJakarta,
} from '@/lib/time';
import { createQuickBusy30Min, createWalkIn, completeEarlyBooking } from '@/server/booking/booking';

export type DeviceStatus = 'free' | 'serving' | 'busy' | 'off';

export interface CapsterDeviceState {
  capsterId: number;
  name: string;
  status: DeviceStatus;
  /** For serving/busy: when the current block ends (ISO). */
  busyUntil: string | null;
  /** For free: when the next booking / block / shift end happens (ISO). null = free till end of day. */
  freeUntil: string | null;
  currentBookingId: number | null;
  currentTicket: string | null;
  currentGuest: string | null;
  nextBookingAt: string | null;
}

interface Interval {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Pure: computes a capster's live status for the branch device.
 * `dayBookings` must exclude cancelled bookings.
 */
export function computeCapsterDeviceState(input: {
  capsterId: number;
  name: string;
  now: Date;
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[];
  dayBookings: (Interval & { id: number; status: string; ticketCode: string; guestName: string | null })[];
  dayTimeOffs: Interval[];
}): CapsterDeviceState {
  const { now } = input;
  const t = now.getTime();
  const dateStr = getJakartaDateString(now);
  const dow = getJakartaDayOfWeek(now);

  const active = input.dayBookings.filter((b) => b.status === 'confirmed');
  const current = active.find((b) => b.startsAt.getTime() <= t && b.endsAt.getTime() > t) ?? null;
  const nextBooking =
    active
      .filter((b) => b.startsAt.getTime() > t)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;

  const base = {
    capsterId: input.capsterId,
    name: input.name,
    currentBookingId: current?.id ?? null,
    currentTicket: current?.ticketCode ?? null,
    currentGuest: current?.guestName ?? null,
    nextBookingAt: nextBooking?.startsAt.toISOString() ?? null,
  };

  if (current) {
    return { ...base, status: 'serving', busyUntil: current.endsAt.toISOString(), freeUntil: null };
  }

  const currentOff = input.dayTimeOffs.find((o) => o.startsAt.getTime() <= t && o.endsAt.getTime() > t);
  if (currentOff) {
    return { ...base, status: 'busy', busyUntil: currentOff.endsAt.toISOString(), freeUntil: null };
  }

  const shift = input.schedules
    .filter((s) => s.dayOfWeek === dow)
    .map((s) => ({
      start: parseJakartaDateTime(dateStr, s.startTime),
      end: parseJakartaDateTime(dateStr, s.endTime),
    }))
    .find((s) => s.start.getTime() <= t && s.end.getTime() > t);

  if (!shift) {
    return { ...base, status: 'off', busyUntil: null, freeUntil: null };
  }

  const candidates = [
    shift.end.getTime(),
    nextBooking?.startsAt.getTime(),
    ...input.dayTimeOffs.map((o) => o.startsAt.getTime()).filter((s) => s > t),
  ].filter((v): v is number => typeof v === 'number');

  return {
    ...base,
    status: 'free',
    busyUntil: null,
    freeUntil: new Date(Math.min(...candidates)).toISOString(),
  };
}

export async function getDeviceState(
  branchId: number,
  now: Date = new Date(),
  db: Database = defaultDb
): Promise<CapsterDeviceState[]> {
  const dayStart = startOfDayJakarta(now);
  const dayEnd = endOfDayJakarta(now);

  const activeCapsters = await db
    .select()
    .from(capsters)
    .where(and(eq(capsters.branchId, branchId), eq(capsters.isActive, true)))
    .orderBy(asc(capsters.id));

  const result: CapsterDeviceState[] = [];
  for (const c of activeCapsters) {
    const [schedules, dayBookings, dayTimeOffs] = await Promise.all([
      db.select().from(capsterSchedules).where(eq(capsterSchedules.capsterId, c.id)),
      db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.capsterId, c.id),
            ne(bookings.status, 'cancelled'),
            lt(bookings.startsAt, dayEnd),
            gt(bookings.endsAt, dayStart)
          )
        ),
      db
        .select()
        .from(timeOffs)
        .where(and(eq(timeOffs.capsterId, c.id), lt(timeOffs.startsAt, dayEnd), gt(timeOffs.endsAt, dayStart))),
    ]);

    result.push(
      computeCapsterDeviceState({
        capsterId: c.id,
        name: c.name,
        now,
        schedules,
        dayBookings: dayBookings.map((b) => ({ ...b, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) })),
        dayTimeOffs: dayTimeOffs.map((o) => ({ startsAt: new Date(o.startsAt), endsAt: new Date(o.endsAt) })),
      })
    );
  }
  return result;
}

/**
 * Walk-in from the device. On conflict, reports the start of the next blocking booking
 * so the device can show "Booking berikutnya jam HH:MM".
 */
export async function deviceWalkIn(
  params: { branchId: number; capsterId: number; now?: Date },
  db: Database = defaultDb
) {
  const now = params.now ?? new Date();
  const res = await createWalkIn({ branchId: params.branchId, capsterId: params.capsterId, now }, db);
  if (res.success) return { success: true as const, booking: res.booking };

  const [blocking] = await db
    .select({ startsAt: bookings.startsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.capsterId, params.capsterId),
        ne(bookings.status, 'cancelled'),
        gte(bookings.endsAt, now)
      )
    )
    .orderBy(asc(bookings.startsAt))
    .limit(1);

  return {
    success: false as const,
    reason: res.reason,
    nextBookingAt: blocking ? new Date(blocking.startsAt) : null,
  };
}

/** "Selesai": completes the capster's current booking and frees the rest of its slot. */
export async function deviceFinishCurrent(
  params: { capsterId: number; now?: Date },
  db: Database = defaultDb
) {
  const now = params.now ?? new Date();
  const [current] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.capsterId, params.capsterId),
        eq(bookings.status, 'confirmed'),
        lt(bookings.startsAt, new Date(now.getTime() + 1)),
        gt(bookings.endsAt, now)
      )
    )
    .limit(1);
  if (!current) return { success: false as const, reason: 'NO_CURRENT_BOOKING' as const };
  const res = await completeEarlyBooking({ bookingId: current.id, now }, db);
  return { success: true as const, booking: res.booking! };
}

/** "Sibuk 30 menit". */
export async function deviceBusy30(params: { capsterId: number; now?: Date }, db: Database = defaultDb) {
  const timeOff = await createQuickBusy30Min({ capsterId: params.capsterId, now: params.now }, db);
  return { success: true as const, timeOff };
}
