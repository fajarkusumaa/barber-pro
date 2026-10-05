import 'server-only';
import { eq } from 'drizzle-orm';
import { db as defaultDb, Database, customers, Booking } from '@/db';
import { Channel } from '@/server/channels/types';
import { ChannelName } from '@/server/messaging/types';
import { botTexts } from '@/server/bot/texts.id';

export type ChannelResolver = (name: ChannelName) => Channel | null;

/**
 * Notifies the customer that the barber cancelled their booking.
 * Silently skips walk-in/admin bookings without a customer, or channels not configured.
 * Never throws: a failed notification must not roll back the cancellation.
 */
export async function notifyBookingCancelledByAdmin(
  booking: Booking,
  resolveChannel: ChannelResolver,
  db: Database = defaultDb
): Promise<{ sent: boolean; reason?: string }> {
  if (!booking.customerId) return { sent: false, reason: 'NO_CUSTOMER' };

  const [customer] = await db.select().from(customers).where(eq(customers.id, booking.customerId));
  if (!customer) return { sent: false, reason: 'CUSTOMER_NOT_FOUND' };

  const channel = resolveChannel(customer.channel);
  if (!channel) return { sent: false, reason: 'CHANNEL_UNAVAILABLE' };

  try {
    await channel.send(customer.externalId, {
      type: 'text',
      text: botTexts.cancelledByAdmin(booking.ticketCode),
    });
    return { sent: true };
  } catch (err) {
    console.error('[notify] Failed to send admin-cancel notification:', (err as Error).message);
    return { sent: false, reason: 'SEND_FAILED' };
  }
}
