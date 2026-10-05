import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './helpers/test-db';
import {
  createBooking,
  cancelBooking,
  createWalkIn,
  completeEarlyBooking,
  createQuickBusy30Min,
} from '@/server/booking/booking';
import { getCapsterAvailability } from '@/server/booking/availability';
import { parseJakartaDateTime } from '@/lib/time';
import { branches, capsters, capsterSchedules, customers, bookings, Database } from '@/db';

describe('Booking Service (Database Operations)', () => {
  let testDb: Database;
  let branchId: number;
  let capster1Id: number;
  let capster2Id: number;

  beforeEach(async () => {
    const { db } = await createTestDatabase();
    testDb = db;

    // Seed test branch
    const [branch] = await testDb
      .insert(branches)
      .values({
        name: 'BarberBot Solo',
      })
      .returning();
    branchId = branch.id;

    // Seed 2 capsters
    const [c1, c2] = await testDb
      .insert(capsters)
      .values([
        { name: 'Budi', branchId, isActive: true },
        { name: 'Anton', branchId, isActive: true },
      ])
      .returning();
    capster1Id = c1.id;
    capster2Id = c2.id;

    // Schedules for Tuesday (dayOfWeek = 2): 09:00 - 17:00
    await testDb.insert(capsterSchedules).values([
      { capsterId: capster1Id, dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
      { capsterId: capster2Id, dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    ]);
  });

  it('successfully creates a booking with unique ticket code', async () => {
    const startsAt = parseJakartaDateTime('2026-10-06', '10:00');
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    const result = await createBooking(
      {
        branchId,
        capsterId: capster1Id,
        startsAt,
        source: 'bot',
        guestName: 'John Doe',
        now,
      },
      testDb
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.booking.ticketCode).toMatch(/^BRB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
      expect(result.booking.capsterId).toBe(capster1Id);
      expect(result.booking.status).toBe('confirmed');
    }
  });

  it('rejects booking when requested slot is unavailable', async () => {
    const startsAt = parseJakartaDateTime('2026-10-06', '10:00');
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    // First booking
    await createBooking(
      {
        branchId,
        capsterId: capster1Id,
        startsAt,
        source: 'bot',
        now,
      },
      testDb
    );

    // Second booking for the same slot and same capster
    const secondResult = await createBooking(
      {
        branchId,
        capsterId: capster1Id,
        startsAt,
        source: 'bot',
        now,
      },
      testDb
    );

    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.reason).toBe('SLOT_UNAVAILABLE');
    }
  });

  it('auto-assigns "any" to the capster with fewest bookings today (and lowest ID on tie)', async () => {
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    // Give Capster 1 an existing booking at 09:00
    await createBooking(
      {
        branchId,
        capsterId: capster1Id,
        startsAt: parseJakartaDateTime('2026-10-06', '09:00'),
        source: 'bot',
        now,
      },
      testDb
    );

    // Now booking for "any" at 11:00 should choose Capster 2 (0 bookings vs Capster 1's 1 booking)
    const result = await createBooking(
      {
        branchId,
        capsterId: 'any',
        startsAt: parseJakartaDateTime('2026-10-06', '11:00'),
        source: 'bot',
        now,
      },
      testDb
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.booking.capsterId).toBe(capster2Id);
    }
  });

  it('auto-assigns "any" to lowest ID when bookings count is tied', async () => {
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    // Both capsters have 0 bookings. Booking at 11:00 for "any" should pick Capster 1 (lowest ID)
    const result = await createBooking(
      {
        branchId,
        capsterId: 'any',
        startsAt: parseJakartaDateTime('2026-10-06', '11:00'),
        source: 'bot',
        now,
      },
      testDb
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.booking.capsterId).toBe(capster1Id);
    }
  });

  it('cancels booking and frees up the slot again', async () => {
    const startsAt = parseJakartaDateTime('2026-10-06', '10:00');
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    const created = await createBooking(
      {
        branchId,
        capsterId: capster1Id,
        startsAt,
        source: 'bot',
        now,
      },
      testDb
    );

    expect(created.success).toBe(true);
    if (!created.success) return;

    // Verify slot is currently blocked
    const slotsBefore = await getCapsterAvailability(
      {
        capsterId: capster1Id,
        targetDate: '2026-10-06',
        now,
      },
      testDb
    );
    expect(slotsBefore.some((s) => s.timeString === '10:00')).toBe(false);

    // Cancel the booking
    const cancelRes = await cancelBooking({ ticketCode: created.booking.ticketCode }, testDb);
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.booking?.status).toBe('cancelled');
    expect(cancelRes.booking?.cancelledAt).toBeDefined();

    // Verify slot is now available again
    const slotsAfter = await getCapsterAvailability(
      {
        capsterId: capster1Id,
        targetDate: '2026-10-06',
        now,
      },
      testDb
    );
    expect(slotsAfter.some((s) => s.timeString === '10:00')).toBe(true);
  });

  it('creates walk-in booking and completes early to free remaining duration', async () => {
    const walkInTime = parseJakartaDateTime('2026-10-06', '10:00');

    const walkInRes = await createWalkIn(
      {
        branchId,
        capsterId: capster1Id,
        guestName: 'Walk-in Customer',
        now: walkInTime,
      },
      testDb
    );

    expect(walkInRes.success).toBe(true);
    if (!walkInRes.success) return;

    expect(walkInRes.booking.source).toBe('walkin');
    expect(walkInRes.booking.customerId).toBeNull();

    // Finish 10 minutes into service at 10:10 instead of default 10:30
    const finishTime = parseJakartaDateTime('2026-10-06', '10:10');
    const completeRes = await completeEarlyBooking(
      {
        bookingId: walkInRes.booking.id,
        now: finishTime,
      },
      testDb
    );

    expect(completeRes.success).toBe(true);
    expect(completeRes.booking?.status).toBe('completed');
    expect(new Date(completeRes.booking!.endsAt).toISOString()).toBe(finishTime.toISOString());
  });

  it('creates quick busy (30 min) time off', async () => {
    const busyStart = parseJakartaDateTime('2026-10-06', '14:00');
    const timeOff = await createQuickBusy30Min(
      {
        capsterId: capster1Id,
        now: busyStart,
      },
      testDb
    );

    expect(timeOff.capsterId).toBe(capster1Id);
    expect(new Date(timeOff.startsAt).toISOString()).toBe(busyStart.toISOString());
    expect(new Date(timeOff.endsAt).toISOString()).toBe(
      parseJakartaDateTime('2026-10-06', '14:30').toISOString()
    );
  });
});
