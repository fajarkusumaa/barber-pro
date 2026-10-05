import 'server-only';
import { db as defaultDb, Database, bookings, capsters, customers, timeOffs, Booking } from '@/db';
import { eq, and, ne, gte, lte, lt, gt, sql } from 'drizzle-orm';
import { generateTicketCode } from '@/lib/ticket';
import { bookingConfig, BookingConfig } from '@/lib/config';
import { getCapsterAvailability } from './availability';
import { getJakartaDateString, parseJakartaDateTime, getJakartaTimeString } from '@/lib/time';
import { bookingMutex } from './lock';

export type BookingResult =
  | { success: true; booking: Booking }
  | {
      success: false;
      reason: 'SLOT_UNAVAILABLE' | 'CAPSTER_NOT_FOUND' | 'TICKET_CODE_ERROR' | 'INVALID_INPUT';
      message?: string;
    };

export interface CreateBookingParams {
  branchId: number;
  capsterId: number | 'any';
  startsAt: Date;
  customerId?: number;
  guestName?: string;
  source: 'bot' | 'admin' | 'walkin';
  notes?: string;
  config?: BookingConfig;
  now?: Date;
}

export interface CancelBookingParams {
  bookingId?: number;
  ticketCode?: string;
  customerId?: number;
}

export interface CreateWalkInParams {
  branchId: number;
  capsterId: number;
  guestName?: string;
  notes?: string;
  config?: BookingConfig;
  now?: Date;
}

export interface CompleteEarlyParams {
  bookingId: number;
  now?: Date;
}

export interface CreateTimeOffParams {
  capsterId: number;
  startsAt: Date;
  endsAt: Date;
  reason?: string;
}

/**
 * Creates a new booking with automatic availability verification,
 * least-busy auto-assignment for 'any', ticket generation with collision handling,
 * transactional row locking, and database exclusion constraint conflict catching.
 */
export async function createBooking(
  params: CreateBookingParams,
  db: Database = defaultDb
): Promise<BookingResult> {
  const {
    branchId,
    capsterId,
    startsAt,
    customerId,
    guestName,
    source,
    notes,
    config = bookingConfig,
    now = new Date(),
  } = params;

  const durationMs = config.defaultDurationMinutes * 60 * 1000;
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const targetDate = getJakartaDateString(startsAt);
  const targetSlotTime = getJakartaTimeString(startsAt);

  // 1. Determine candidate capsters
  let candidateCapsterIds: number[] = [];

  if (capsterId === 'any') {
    const activeCapsters = await db
      .select()
      .from(capsters)
      .where(and(eq(capsters.branchId, branchId), eq(capsters.isActive, true)));

    if (activeCapsters.length === 0) {
      return { success: false, reason: 'SLOT_UNAVAILABLE', message: 'No active capsters found' };
    }

    const availableCapsters: { id: number; bookingsCount: number }[] = [];
    const targetDayStart = parseJakartaDateTime(targetDate, '00:00:00');
    const targetDayEnd = parseJakartaDateTime(targetDate, '23:59:59');

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

      const hasSlot = slots.some((s) => s.timeString === targetSlotTime);
      if (hasSlot) {
        const [countResult] = await db
          .select({
            count: sql<number>`cast(count(*) as integer)`,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.capsterId, capster.id),
              ne(bookings.status, 'cancelled'),
              gte(bookings.startsAt, targetDayStart),
              lte(bookings.startsAt, targetDayEnd)
            )
          );

        availableCapsters.push({
          id: capster.id,
          bookingsCount: countResult?.count ?? 0,
        });
      }
    }

    if (availableCapsters.length === 0) {
      return { success: false, reason: 'SLOT_UNAVAILABLE' };
    }

    // Auto-assign rule: fewest bookings today, tie-breaker: lowest id
    availableCapsters.sort((a, b) => {
      if (a.bookingsCount !== b.bookingsCount) {
        return a.bookingsCount - b.bookingsCount;
      }
      return a.id - b.id;
    });

    candidateCapsterIds = availableCapsters.map((c) => c.id);
  } else {
    // Specific capster requested
    candidateCapsterIds = [capsterId];
  }

  // 2. Try to insert booking for candidates using mutex + transaction
  const MAX_TICKET_RETRIES = 5;

  for (const selectedCapsterId of candidateCapsterIds) {
    try {
      const result = await bookingMutex.acquire(`capster:${selectedCapsterId}`, async () => {
        // Re-check slot availability under lock
        const slots = await getCapsterAvailability(
          {
            capsterId: selectedCapsterId,
            targetDate,
            config,
            now,
          },
          db
        );

        const hasSlot = slots.some((s) => s.timeString === targetSlotTime);
        if (!hasSlot) {
          return { success: false as const, reason: 'SLOT_UNAVAILABLE' as const };
        }

        return await db.transaction(async (tx) => {
          // Lock capster record to serialize concurrent DB transactions
          await tx.execute(
            sql`SELECT id FROM capsters WHERE id = ${selectedCapsterId} FOR UPDATE`
          );

          // Check for any overlapping active bookings within the transaction
          const existingConflicts = await tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.capsterId, selectedCapsterId),
                ne(bookings.status, 'cancelled'),
                lt(bookings.startsAt, endsAt),
                gt(bookings.endsAt, startsAt)
              )
            );

          if (existingConflicts.length > 0) {
            return { success: false as const, reason: 'SLOT_UNAVAILABLE' as const };
          }

          // Check for any overlapping time offs within the transaction
          const existingTimeOffConflicts = await tx
            .select({ id: timeOffs.id })
            .from(timeOffs)
            .where(
              and(
                eq(timeOffs.capsterId, selectedCapsterId),
                lt(timeOffs.startsAt, endsAt),
                gt(timeOffs.endsAt, startsAt)
              )
            );

          if (existingTimeOffConflicts.length > 0) {
            return { success: false as const, reason: 'SLOT_UNAVAILABLE' as const };
          }

          // Generate ticket code and insert
          let ticketRetryCount = 0;
          while (ticketRetryCount < MAX_TICKET_RETRIES) {
            const ticketCode = generateTicketCode(config.ticketPrefix);
            try {
              const [insertedBooking] = await tx
                .insert(bookings)
                .values({
                  ticketCode,
                  customerId: customerId ?? null,
                  guestName: guestName ?? null,
                  branchId,
                  capsterId: selectedCapsterId,
                  startsAt,
                  endsAt,
                  status: 'confirmed',
                  source,
                  notes: notes ?? null,
                })
                .returning();

              return { success: true as const, booking: insertedBooking };
            } catch (err: any) {
              if (err.code === '23505' || err.message?.includes('ticket_code')) {
                ticketRetryCount++;
                continue;
              }
              throw err;
            }
          }

          return { success: false as const, reason: 'TICKET_CODE_ERROR' as const };
        });
      });

      if (result.success) {
        return result;
      }
    } catch (err: any) {
      // Postgres error 23P01 = exclusion_violation (anti double booking constraint)
      if (
        err.code === '23P01' ||
        err.message?.includes('bookings_no_overlap') ||
        err.message?.includes('exclusion')
      ) {
        continue;
      }
      throw err;
    }
  }

  return { success: false, reason: 'SLOT_UNAVAILABLE' };
}

/**
 * Cancels a booking by ticketCode or bookingId, setting status = 'cancelled' and cancelled_at = now.
 */
export async function cancelBooking(
  params: CancelBookingParams,
  db: Database = defaultDb
): Promise<{ success: boolean; booking?: Booking; reason?: string }> {
  const { bookingId, ticketCode, customerId } = params;

  let query = db.select().from(bookings);

  if (ticketCode) {
    query = query.where(eq(bookings.ticketCode, ticketCode)) as any;
  } else if (bookingId) {
    query = query.where(eq(bookings.id, bookingId)) as any;
  } else {
    return { success: false, reason: 'INVALID_PARAMS' };
  }

  const [existing] = await query;
  if (!existing) {
    return { success: false, reason: 'NOT_FOUND' };
  }

  if (customerId && existing.customerId !== customerId) {
    return { success: false, reason: 'UNAUTHORIZED' };
  }

  if (existing.status === 'cancelled') {
    return { success: true, booking: existing };
  }

  const [updated] = await db
    .update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, existing.id))
    .returning();

  return { success: true, booking: updated };
}

/**
 * Creates a walk-in booking for a capster right now.
 */
export async function createWalkIn(
  params: CreateWalkInParams,
  db: Database = defaultDb
): Promise<BookingResult> {
  const { branchId, capsterId, guestName, notes, config = bookingConfig, now = new Date() } = params;
  const durationMs = config.defaultDurationMinutes * 60 * 1000;
  const endsAt = new Date(now.getTime() + durationMs);

  const MAX_TICKET_RETRIES = 5;

  try {
    const result = await bookingMutex.acquire(`capster:${capsterId}`, async () => {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM capsters WHERE id = ${capsterId} FOR UPDATE`
        );

        // Check for conflicts
        const conflicts = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.capsterId, capsterId),
              ne(bookings.status, 'cancelled'),
              lt(bookings.startsAt, endsAt),
              gt(bookings.endsAt, now)
            )
          );

        if (conflicts.length > 0) {
          return {
            success: false as const,
            reason: 'SLOT_UNAVAILABLE' as const,
            message: 'Capster is currently occupied or has an upcoming booking that overlaps.',
          };
        }

        let retry = 0;
        while (retry < MAX_TICKET_RETRIES) {
          const ticketCode = generateTicketCode(config.ticketPrefix);
          try {
            const [insertedBooking] = await tx
              .insert(bookings)
              .values({
                ticketCode,
                customerId: null,
                guestName: guestName ?? 'Walk-in Guest',
                branchId,
                capsterId,
                startsAt: now,
                endsAt,
                status: 'confirmed',
                source: 'walkin',
                notes: notes ?? null,
              })
              .returning();

            return { success: true as const, booking: insertedBooking };
          } catch (err: any) {
            if (err.code === '23505' || err.message?.includes('ticket_code')) {
              retry++;
              continue;
            }
            throw err;
          }
        }

        return { success: false as const, reason: 'TICKET_CODE_ERROR' as const };
      });
    });

    return result;
  } catch (err: any) {
    if (
      err.code === '23P01' ||
      err.message?.includes('bookings_no_overlap') ||
      err.message?.includes('exclusion')
    ) {
      return {
        success: false,
        reason: 'SLOT_UNAVAILABLE',
        message: 'Capster is currently occupied or has an upcoming booking that overlaps.',
      };
    }
    throw err;
  }
}

/**
 * Marks a booking as completed and cuts ends_at to min(ends_at, now) so remaining time is freed.
 */
export async function completeEarlyBooking(
  params: CompleteEarlyParams,
  db: Database = defaultDb
): Promise<{ success: boolean; booking?: Booking; reason?: string }> {
  const { bookingId, now = new Date() } = params;

  const [existing] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!existing) {
    return { success: false, reason: 'NOT_FOUND' };
  }

  const originalEnd = new Date(existing.endsAt).getTime();
  const newEnd = new Date(Math.min(originalEnd, now.getTime()));

  const [updated] = await db
    .update(bookings)
    .set({
      status: 'completed',
      endsAt: newEnd,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning();

  return { success: true, booking: updated };
}

/**
 * Creates a 30-minute busy / time-off block for a capster starting now.
 */
export async function createQuickBusy30Min(
  params: { capsterId: number; reason?: string; now?: Date },
  db: Database = defaultDb
) {
  const { capsterId, reason = 'Quick Busy (30 min)', now = new Date() } = params;
  const endsAt = new Date(now.getTime() + 30 * 60 * 1000);

  const [inserted] = await db
    .insert(timeOffs)
    .values({
      capsterId,
      startsAt: now,
      endsAt,
      reason,
    })
    .returning();

  return inserted;
}
