import 'server-only';
import { db as defaultDb, Database, customers, chatSessions, Customer, ChatSession } from '@/db';
import { eq, and } from 'drizzle-orm';
import { InboundMessage } from '../messaging/types';
import { BotState, SessionContext, CustomerSession } from './types';
import { bookingConfig } from '@/lib/config';

/**
 * Resolves or creates a Customer and their associated ChatSession.
 * Enforces session timeout reset (returns to IDLE if idle > 30 mins).
 */
export async function resolveCustomerAndSession(
  msg: InboundMessage,
  database: Database = defaultDb,
  now: Date = new Date()
): Promise<{ customer: Customer; session: CustomerSession }> {
  // 1. Find or create customer
  let [customer] = await database
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.channel, msg.channel),
        eq(customers.externalId, msg.externalId)
      )
    );

  if (!customer) {
    const [created] = await database
      .insert(customers)
      .values({
        channel: msg.channel,
        externalId: msg.externalId,
        name: msg.name ?? null,
        lastInboundAt: now,
      })
      .returning();
    customer = created;
  } else {
    // Update last inbound timestamp and name if changed
    await database
      .update(customers)
      .set({
        lastInboundAt: now,
        ...(msg.name && !customer.name ? { name: msg.name } : {}),
        updatedAt: now,
      })
      .where(eq(customers.id, customer.id));
  }

  // 2. Find or create chat session
  let [rawSession] = await database
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.customerId, customer.id));

  if (!rawSession) {
    const [created] = await database
      .insert(chatSessions)
      .values({
        customerId: customer.id,
        state: 'IDLE',
        context: {},
        lastActivityAt: now,
      })
      .returning();
    rawSession = created;
  }

  // 3. Check for session timeout (default 30 mins)
  const timeoutMs = bookingConfig.sessionTimeoutMinutes * 60 * 1000;
  const lastActivityMs = new Date(rawSession.lastActivityAt).getTime();
  const isExpired = now.getTime() - lastActivityMs > timeoutMs;

  let state = rawSession.state as BotState;
  let context = (rawSession.context ?? {}) as SessionContext;

  if (isExpired && state !== 'IDLE') {
    state = 'IDLE';
    context = {};
    await database
      .update(chatSessions)
      .set({
        state: 'IDLE',
        context: {},
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(chatSessions.id, rawSession.id));
  }

  return {
    customer,
    session: {
      customerId: customer.id,
      customerName: customer.name ?? undefined,
      state,
      context,
      lastActivityAt: new Date(rawSession.lastActivityAt),
    },
  };
}

/**
 * Persists updated session state and context into the database.
 */
export async function saveSession(
  customerId: number,
  state: BotState,
  context: SessionContext,
  database: Database = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await database
    .update(chatSessions)
    .set({
      state,
      context,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(eq(chatSessions.customerId, customerId));
}
