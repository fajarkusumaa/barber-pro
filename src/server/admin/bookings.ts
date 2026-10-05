import 'server-only';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db as defaultDb, Database, bookings, capsters, customers, Booking } from '@/db';
import { bookingConfig, BookingConfig } from '@/lib/config';
import { parseJakartaDateTime } from '@/lib/time';
import { cancelBooking, completeEarlyBooking, createBooking } from '@/server/booking/booking';
import { getCapsterAvailability } from '@/server/booking/availability';
import { ChannelResolver, notifyBookingCancelledByAdmin } from '@/server/notifications/cancellation';

export const LATE_THRESHOLD_MINUTES = 15;

export type BookingStatus = Booking['status'];

/** Pure: a confirmed booking whose start passed more than 15 minutes ago. */
export function isBookingLate(
  booking: { status: string; startsAt: Date },
  now: Date = new Date()
): boolean {
  return (
    booking.status === 'confirmed' &&
    now.getTime() - new Date(booking.startsAt).getTime() > LATE_THRESHOLD_MINUTES * 60 * 1000
  );
}

function dayRange(date: string) {
  return {
    start: parseJakartaDateTime(date, '00:00:00'),
    end: parseJakartaDateTime(date, '23:59:59'),
  };
}

export async function listBookings(
  filter: { date: string; capsterId?: number; status?: BookingStatus },
  db: Database = defaultDb
) {
  const { start, end } = dayRange(filter.date);
  const conditions = [gte(bookings.startsAt, start), lte(bookings.startsAt, end)];
  if (filter.capsterId) conditions.push(eq(bookings.capsterId, filter.capsterId));
  if (filter.status) conditions.push(eq(bookings.status, filter.status));

  return db
    .select({
      id: bookings.id,
      ticketCode: bookings.ticketCode,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      source: bookings.source,
      guestName: bookings.guestName,
      capsterId: bookings.capsterId,
      capsterName: capsters.name,
      customerId: bookings.customerId,
      customerName: customers.name,
      customerChannel: customers.channel,
    })
    .from(bookings)
    .innerJoin(capsters, eq(bookings.capsterId, capsters.id))
    .leftJoin(customers, eq(bookings.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(asc(bookings.startsAt));
}

export type BookingRow = Awaited<ReturnType<typeof listBookings>>[number];

export async function getTodaySummary(date: string, db: Database = defaultDb) {
  const { start, end } = dayRange(date);
  const [row] = await db
    .select({
      total: sql<number>`cast(count(*) filter (where ${bookings.status} <> 'cancelled') as integer)`,
      walkins: sql<number>`cast(count(*) filter (where ${bookings.source} = 'walkin' and ${bookings.status} <> 'cancelled') as integer)`,
      fromBot: sql<number>`cast(count(*) filter (where ${bookings.source} = 'bot' and ${bookings.status} <> 'cancelled') as integer)`,
      completed: sql<number>`cast(count(*) filter (where ${bookings.status} = 'completed') as integer)`,
      noShows: sql<number>`cast(count(*) filter (where ${bookings.status} = 'no_show') as integer)`,
      cancelled: sql<number>`cast(count(*) filter (where ${bookings.status} = 'cancelled') as integer)`,
    })
    .from(bookings)
    .where(and(gte(bookings.startsAt, start), lte(bookings.startsAt, end)));
  return row;
}

async function findBooking(id: number, db: Database) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
  return row ?? null;
}

export async function adminCompleteBooking(id: number, now: Date = new Date(), db: Database = defaultDb) {
  const existing = await findBooking(id, db);
  if (!existing) return { success: false as const, reason: 'NOT_FOUND' as const };
  if (existing.status !== 'confirmed') return { success: false as const, reason: 'INVALID_STATUS' as const };
  const res = await completeEarlyBooking({ bookingId: id, now }, db);
  return res.success ? { success: true as const, booking: res.booking! } : { success: false as const, reason: 'NOT_FOUND' as const };
}

export async function adminMarkNoShow(id: number, db: Database = defaultDb) {
  const existing = await findBooking(id, db);
  if (!existing) return { success: false as const, reason: 'NOT_FOUND' as const };
  if (existing.status !== 'confirmed') return { success: false as const, reason: 'INVALID_STATUS' as const };
  const [updated] = await db
    .update(bookings)
    .set({ status: 'no_show', updatedAt: new Date() })
    .where(eq(bookings.id, id))
    .returning();
  return { success: true as const, booking: updated };
}

/**
 * Cancels a booking from the dashboard and notifies the customer (if any).
 * Notification only fires on the actual transition to `cancelled`.
 */
export async function adminCancelBooking(
  id: number,
  resolveChannel: ChannelResolver,
  db: Database = defaultDb
) {
  const existing = await findBooking(id, db);
  if (!existing) return { success: false as const, reason: 'NOT_FOUND' as const };
  if (existing.status !== 'confirmed') return { success: false as const, reason: 'INVALID_STATUS' as const };

  const res = await cancelBooking({ bookingId: id }, db);
  if (!res.success || !res.booking) return { success: false as const, reason: 'NOT_FOUND' as const };

  const notification = await notifyBookingCancelledByAdmin(res.booking, resolveChannel, db);
  return { success: true as const, booking: res.booking, notified: notification.sent };
}

/** Admin bookings skip the customer lead time; everything else follows bot rules. */
export const adminBookingConfig: BookingConfig = { ...bookingConfig, minLeadMinutes: 0 };

export async function getAdminSlots(
  params: { capsterId: number; date: string; now?: Date },
  db: Database = defaultDb
) {
  return getCapsterAvailability(
    { capsterId: params.capsterId, targetDate: params.date, config: adminBookingConfig, now: params.now },
    db
  );
}

export async function createManualBooking(
  params: { branchId: number; capsterId: number; startsAt: Date; guestName: string; notes?: string; now?: Date },
  db: Database = defaultDb
) {
  return createBooking(
    {
      branchId: params.branchId,
      capsterId: params.capsterId,
      startsAt: params.startsAt,
      guestName: params.guestName.trim(),
      notes: params.notes?.trim() || undefined,
      source: 'admin',
      config: adminBookingConfig,
      now: params.now,
    },
    db
  );
}

export async function listCustomers(db: Database = defaultDb) {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      channel: customers.channel,
      externalId: customers.externalId,
      lastInboundAt: customers.lastInboundAt,
      totalBookings: sql<number>`cast(count(${bookings.id}) as integer)`,
      activeBookings: sql<number>`cast(count(${bookings.id}) filter (where ${bookings.status} = 'confirmed' and ${bookings.startsAt} >= now()) as integer)`,
    })
    .from(customers)
    .leftJoin(bookings, eq(bookings.customerId, customers.id))
    .groupBy(customers.id)
    .orderBy(desc(customers.lastInboundAt));
}

export async function getCustomerWithBookings(id: number, db: Database = defaultDb) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;
  const history = await db
    .select({
      id: bookings.id,
      ticketCode: bookings.ticketCode,
      startsAt: bookings.startsAt,
      status: bookings.status,
      source: bookings.source,
      capsterName: capsters.name,
    })
    .from(bookings)
    .innerJoin(capsters, eq(bookings.capsterId, capsters.id))
    .where(eq(bookings.customerId, id))
    .orderBy(desc(bookings.startsAt));
  return { customer, history };
}
