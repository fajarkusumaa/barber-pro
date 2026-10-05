import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './helpers/test-db';
import {
  parseDayShifts,
  formatDayShifts,
  listCapsters,
  createCapster,
  updateCapster,
  getCapsterDetail,
  replaceWeeklySchedule,
  addTimeOff,
  deleteTimeOff,
} from '@/server/admin/capsters';
import {
  listBookings,
  getTodaySummary,
  adminCompleteBooking,
  adminMarkNoShow,
  adminCancelBooking,
  createManualBooking,
  isBookingLate,
  listCustomers,
  getCustomerWithBookings,
} from '@/server/admin/bookings';
import { branches, capsters, customers, bookings, Database } from '@/db';
import { parseJakartaDateTime, getJakartaDateString } from '@/lib/time';
import { FakeChannel } from '@/server/channels/fake';

describe('Admin Capsters & Bookings Service', () => {
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
  });

  describe('Shift Parsing & Formatting', () => {
    it('parses valid shifts correctly', () => {
      const res = parseDayShifts(1, '09:00-12:00, 13:00-17:00');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.shifts.length).toBe(2);
        expect(res.shifts[0]).toEqual({ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' });
        expect(res.shifts[1]).toEqual({ dayOfWeek: 1, startTime: '13:00', endTime: '17:00' });
      }
    });

    it('rejects overlapping shifts or invalid hours', () => {
      const overlap = parseDayShifts(1, '09:00-13:00, 12:00-17:00');
      expect(overlap.ok).toBe(false);

      const invalidTime = parseDayShifts(1, '17:00-12:00');
      expect(invalidTime.ok).toBe(false);
    });

    it('formats shifts back to text', () => {
      const text = formatDayShifts([
        { startTime: '13:00', endTime: '17:00' },
        { startTime: '09:00', endTime: '12:00' },
      ]);
      expect(text).toBe('09:00-12:00, 13:00-17:00');
    });
  });

  describe('Capster Management', () => {
    it('creates, updates, and manages schedules & time offs', async () => {
      const newCapster = await createCapster({ branchId, name: 'Anton' }, testDb);
      expect(newCapster.name).toBe('Anton');

      await updateCapster({ id: newCapster.id, name: 'Anton Fade', isActive: true }, testDb);
      const capstersList = await listCapsters(testDb);
      expect(capstersList.some((c) => c.name === 'Anton Fade')).toBe(true);

      // Schedule
      await replaceWeeklySchedule(
        newCapster.id,
        [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' },
        ],
        testDb
      );

      // Time off
      const startsAt = parseJakartaDateTime('2026-10-10', '09:00:00');
      const endsAt = parseJakartaDateTime('2026-10-10', '17:00:00');
      const timeOffRes = await addTimeOff(
        { capsterId: newCapster.id, startsAt, endsAt, reason: 'Sakit' },
        testDb
      );
      expect(timeOffRes.success).toBe(true);

      const detail = await getCapsterDetail(newCapster.id, parseJakartaDateTime('2026-10-09', '00:00:00'), testDb);
      expect(detail?.schedules.length).toBe(2);
      expect(detail?.timeOffs.length).toBe(1);

      if (timeOffRes.success && timeOffRes.timeOff) {
        await deleteTimeOff(timeOffRes.timeOff.id, testDb);
        const detailAfter = await getCapsterDetail(newCapster.id, parseJakartaDateTime('2026-10-09', '00:00:00'), testDb);
        expect(detailAfter?.timeOffs.length).toBe(0);
      }
    });
  });

  describe('Bookings Administration', () => {
    it('creates manual booking and runs admin lifecycle actions', async () => {
      // Set schedule for capster
      await replaceWeeklySchedule(
        capsterId,
        [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }], // Monday
        testDb
      );

      const targetDate = '2026-10-12'; // Monday
      const startsAt = parseJakartaDateTime(targetDate, '10:00:00');

      const manualRes = await createManualBooking(
        {
          branchId,
          capsterId,
          startsAt,
          guestName: 'Pak Wahyu',
          notes: 'VIP guest',
        },
        testDb
      );

      expect(manualRes.success).toBe(true);
      if (!manualRes.success) return;

      const booking = manualRes.booking;
      expect(booking.guestName).toBe('Pak Wahyu');
      expect(booking.source).toBe('admin');

      // Check summary
      const summary = await getTodaySummary(targetDate, testDb);
      expect(summary.total).toBe(1);

      // Check list
      const list = await listBookings({ date: targetDate }, testDb);
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(booking.id);

      // Complete booking
      const compRes = await adminCompleteBooking(booking.id, new Date(), testDb);
      expect(compRes.success).toBe(true);
      expect(compRes.booking?.status).toBe('completed');
    });

    it('cancels booking and sends proactive notification to customer', async () => {
      const [customer] = await testDb
        .insert(customers)
        .values({
          channel: 'telegram',
          externalId: '12345678',
          name: 'Joko Customer',
        })
        .returning();

      const startsAt = parseJakartaDateTime('2026-10-12', '14:00:00');
      const endsAt = parseJakartaDateTime('2026-10-12', '14:30:00');

      const [booking] = await testDb
        .insert(bookings)
        .values({
          ticketCode: 'BRB-9988',
          customerId: customer.id,
          branchId,
          capsterId,
          startsAt,
          endsAt,
          status: 'confirmed',
          source: 'bot',
        })
        .returning();

      const fakeChannel = new FakeChannel('telegram');
      const channelResolver = (name: string) => (name === 'telegram' ? fakeChannel : null);

      const cancelRes = await adminCancelBooking(booking.id, channelResolver as any, testDb);
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.notified).toBe(true);
      expect(fakeChannel.sentMessages.length).toBe(1);
      expect(fakeChannel.sentMessages[0].to).toBe('12345678');
      expect((fakeChannel.sentMessages[0].message as any).text).toContain('BRB-9988');

      // Check customers overview
      const customersList = await listCustomers(testDb);
      expect(customersList.length).toBe(1);
      expect(customersList[0].name).toBe('Joko Customer');

      const detail = await getCustomerWithBookings(customer.id, testDb);
      expect(detail?.history.length).toBe(1);
      expect(detail?.history[0].status).toBe('cancelled');
    });

    it('identifies late bookings correctly', () => {
      const now = parseJakartaDateTime('2026-10-12', '10:20:00');
      const lateBooking = {
        status: 'confirmed',
        startsAt: parseJakartaDateTime('2026-10-12', '10:00:00'), // 20 mins late
      };
      const onTimeBooking = {
        status: 'confirmed',
        startsAt: parseJakartaDateTime('2026-10-12', '10:10:00'), // 10 mins late (under 15 min threshold)
      };

      expect(isBookingLate(lateBooking, now)).toBe(true);
      expect(isBookingLate(onTimeBooking, now)).toBe(false);
    });
  });
});
