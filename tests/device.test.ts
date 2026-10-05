import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './helpers/test-db';
import {
  computeCapsterDeviceState,
  getDeviceState,
  deviceWalkIn,
  deviceFinishCurrent,
  deviceBusy30,
} from '@/server/admin/device';
import { branches, capsters, capsterSchedules, bookings, Database } from '@/db';
import { parseJakartaDateTime, getJakartaTimeString } from '@/lib/time';

describe('Device (/device) Service & State Calculation', () => {
  describe('computeCapsterDeviceState (Pure)', () => {
    const schedules = [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]; // Monday

    it('returns "off" when current time is outside working schedules', () => {
      const now = parseJakartaDateTime('2026-10-12', '08:30:00'); // Monday before 9
      const state = computeCapsterDeviceState({
        capsterId: 1,
        name: 'Budi',
        now,
        schedules,
        dayBookings: [],
        dayTimeOffs: [],
      });

      expect(state.status).toBe('off');
    });

    it('returns "free" during shift with next booking time indicated', () => {
      const now = parseJakartaDateTime('2026-10-12', '10:00:00');
      const futureBooking = {
        id: 101,
        status: 'confirmed',
        ticketCode: 'BRB-1234',
        guestName: 'Andi',
        startsAt: parseJakartaDateTime('2026-10-12', '11:00:00'),
        endsAt: parseJakartaDateTime('2026-10-12', '11:30:00'),
      };

      const state = computeCapsterDeviceState({
        capsterId: 1,
        name: 'Budi',
        now,
        schedules,
        dayBookings: [futureBooking],
        dayTimeOffs: [],
      });

      expect(state.status).toBe('free');
      expect(state.freeUntil).toBe(futureBooking.startsAt.toISOString());
    });

    it('returns "serving" when there is an active ongoing booking', () => {
      const now = parseJakartaDateTime('2026-10-12', '10:15:00');
      const activeBooking = {
        id: 101,
        status: 'confirmed',
        ticketCode: 'BRB-1234',
        guestName: 'Andi',
        startsAt: parseJakartaDateTime('2026-10-12', '10:00:00'),
        endsAt: parseJakartaDateTime('2026-10-12', '10:30:00'),
      };

      const state = computeCapsterDeviceState({
        capsterId: 1,
        name: 'Budi',
        now,
        schedules,
        dayBookings: [activeBooking],
        dayTimeOffs: [],
      });

      expect(state.status).toBe('serving');
      expect(state.currentTicket).toBe('BRB-1234');
      expect(state.busyUntil).toBe(activeBooking.endsAt.toISOString());
    });

    it('returns "busy" when there is an active time-off / break', () => {
      const now = parseJakartaDateTime('2026-10-12', '12:15:00');
      const timeOff = {
        startsAt: parseJakartaDateTime('2026-10-12', '12:00:00'),
        endsAt: parseJakartaDateTime('2026-10-12', '13:00:00'),
      };

      const state = computeCapsterDeviceState({
        capsterId: 1,
        name: 'Budi',
        now,
        schedules,
        dayBookings: [],
        dayTimeOffs: [timeOff],
      });

      expect(state.status).toBe('busy');
      expect(state.busyUntil).toBe(timeOff.endsAt.toISOString());
    });
  });

  describe('Device DB Actions', () => {
    let testDb: Database;
    let branchId: number;
    let capsterId: number;

    beforeEach(async () => {
      const { db } = await createTestDatabase();
      testDb = db;

      const [branch] = await testDb
        .insert(branches)
        .values({ name: 'Solo Grand Mall' })
        .returning();
      branchId = branch.id;

      const [capster] = await testDb
        .insert(capsters)
        .values({ branchId, name: 'Budi' })
        .returning();
      capsterId = capster.id;

      await testDb.insert(capsterSchedules).values([
        { capsterId, dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
      ]);
    });

    it('creates walk-in and transitions state to serving', async () => {
      const now = parseJakartaDateTime('2026-10-12', '10:00:00');

      const walkinRes = await deviceWalkIn({ branchId, capsterId, now }, testDb);
      expect(walkinRes.success).toBe(true);

      const states = await getDeviceState(branchId, now, testDb);
      expect(states[0].status).toBe('serving');
      expect(states[0].currentTicket).toBeDefined();

      // Finish current walk-in
      const finishTime = parseJakartaDateTime('2026-10-12', '10:15:00'); // finished in 15m instead of 30m
      const finishRes = await deviceFinishCurrent({ capsterId, now: finishTime }, testDb);
      expect(finishRes.success).toBe(true);

      const statesAfter = await getDeviceState(branchId, finishTime, testDb);
      expect(statesAfter[0].status).toBe('free');
    });

    it('warns on walk-in clash and reports upcoming booking start time', async () => {
      const now = parseJakartaDateTime('2026-10-12', '10:00:00');
      const upcomingStart = parseJakartaDateTime('2026-10-12', '10:15:00'); // only 15 min gap, default walkin is 30m
      const upcomingEnd = parseJakartaDateTime('2026-10-12', '10:45:00');

      await testDb.insert(bookings).values({
        ticketCode: 'BRB-FUTURE',
        branchId,
        capsterId,
        startsAt: upcomingStart,
        endsAt: upcomingEnd,
        status: 'confirmed',
        source: 'bot',
      });

      const walkinRes = await deviceWalkIn({ branchId, capsterId, now }, testDb);
      expect(walkinRes.success).toBe(false);
      expect(walkinRes.nextBookingAt).toEqual(upcomingStart);
    });

    it('handles quick busy 30 min action', async () => {
      const now = parseJakartaDateTime('2026-10-12', '11:00:00');
      const busyRes = await deviceBusy30({ capsterId, now }, testDb);
      expect(busyRes.success).toBe(true);

      const states = await getDeviceState(branchId, now, testDb);
      expect(states[0].status).toBe('busy');
    });
  });
});
