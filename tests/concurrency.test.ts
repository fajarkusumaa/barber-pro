import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './helpers/test-db';
import { createBooking } from '@/server/booking/booking';
import { parseJakartaDateTime } from '@/lib/time';
import { branches, capsters, capsterSchedules, bookings, Database } from '@/db';
import { eq, and, ne } from 'drizzle-orm';

describe('Concurrency & Double Booking Prevention', () => {
  let testDb: Database;
  let branchId: number;
  let capsterId: number;

  beforeEach(async () => {
    const { db } = await createTestDatabase();
    testDb = db;

    // Seed branch & 1 capster
    const [branch] = await testDb
      .insert(branches)
      .values({
        name: 'BarberBot Solo',
      })
      .returning();
    branchId = branch.id;

    const [c1] = await testDb
      .insert(capsters)
      .values([
        { name: 'Budi Senior', branchId, isActive: true },
      ])
      .returning();
    capsterId = c1.id;

    // Schedule: Tuesday (2) 09:00 - 17:00
    await testDb.insert(capsterSchedules).values([
      { capsterId, dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    ]);
  });

  it('handles simultaneous parallel bookings for the exact same slot: exactly one succeeds and one is rejected', async () => {
    const startsAt = parseJakartaDateTime('2026-10-06', '10:00');
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    // Run 2 booking requests simultaneously in parallel
    const [result1, result2] = await Promise.all([
      createBooking(
        {
          branchId,
          capsterId,
          startsAt,
          guestName: 'Customer A',
          source: 'bot',
          now,
        },
        testDb
      ),
      createBooking(
        {
          branchId,
          capsterId,
          startsAt,
          guestName: 'Customer B',
          source: 'bot',
          now,
        },
        testDb
      ),
    ]);

    const successes = [result1, result2].filter((r) => r.success);
    const failures = [result1, result2].filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    if (failures[0] && !failures[0].success) {
      expect(failures[0].reason).toBe('SLOT_UNAVAILABLE');
    }

    // Verify in database: exactly 1 booking exists
    const recordedBookings = await testDb
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.capsterId, capsterId),
          eq(bookings.startsAt, startsAt),
          ne(bookings.status, 'cancelled')
        )
      );

    expect(recordedBookings.length).toBe(1);
  });

  it('handles 5 simultaneous parallel bookings for the exact same single slot: exactly 1 succeeds and 4 fail', async () => {
    const startsAt = parseJakartaDateTime('2026-10-06', '14:00');
    const now = parseJakartaDateTime('2026-10-06', '08:00');

    const parallelRequests = Array.from({ length: 5 }, (_, i) =>
      createBooking(
        {
          branchId,
          capsterId,
          startsAt,
          guestName: `Concurrent Customer ${i + 1}`,
          source: 'bot',
          now,
        },
        testDb
      )
    );

    const results = await Promise.all(parallelRequests);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);

    for (const f of failures) {
      if (!f.success) {
        expect(f.reason).toBe('SLOT_UNAVAILABLE');
      }
    }
  });
});
