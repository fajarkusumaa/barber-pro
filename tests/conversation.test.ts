import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './helpers/test-db';
import { ConversationService } from '@/server/bot/conversation';
import { FakeChannel } from '@/server/channels/fake';
import { InboundMessage } from '@/server/messaging/types';
import { branches, capsters, capsterSchedules, bookings, Database } from '@/db';
import { parseJakartaDateTime, getJakartaDateString } from '@/lib/time';
import { createBooking } from '@/server/booking/booking';

describe('ConversationService (End-to-End Bot State Machine)', () => {
  let testDb: Database;
  let service: ConversationService;
  let fakeChannel: FakeChannel;
  let branchId: number;
  let capster1Id: number;
  let capster2Id: number;

  const userChatId = 'user_tg_1001';
  const targetDate = '2026-10-06'; // Tuesday
  const now = parseJakartaDateTime('2026-10-06', '08:00'); // 08:00 WIB

  beforeEach(async () => {
    const { db } = await createTestDatabase();
    testDb = db;
    service = new ConversationService(testDb);
    fakeChannel = new FakeChannel('telegram');

    // 1. Seed Branch
    const [branch] = await testDb
      .insert(branches)
      .values({ name: 'BarberBot Solo' })
      .returning();
    branchId = branch.id;

    // 2. Seed 2 Capsters
    const [c1, c2] = await testDb
      .insert(capsters)
      .values([
        { name: 'Budi Senior', branchId, isActive: true },
        { name: 'Anton Stylist', branchId, isActive: true },
      ])
      .returning();
    capster1Id = c1.id;
    capster2Id = c2.id;

    // 3. Schedules for Tuesday (2): 09:00 - 13:00 (8 slots each)
    await testDb.insert(capsterSchedules).values([
      { capsterId: capster1Id, dayOfWeek: 2, startTime: '09:00', endTime: '13:00' },
      { capsterId: capster2Id, dayOfWeek: 2, startTime: '09:00', endTime: '13:00' },
    ]);
  });

  it('completes a full end-to-end booking flow from /start to ticket issued', async () => {
    // 1. /start
    const msg1: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'msg_1',
      kind: 'text',
      text: '/start',
      name: 'Pelanggan Baru',
    };
    const res1 = await service.handleMessage(msg1, fakeChannel, now);
    expect(res1.type).toBe('buttons');
    if (res1.type === 'buttons') {
      expect(res1.buttons.some((b) => b.id === 'menu:book')).toBe(true);
    }

    // 2. Select Booking menu
    const msg2: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'msg_2',
      kind: 'action',
      actionId: 'menu:book',
    };
    const res2 = await service.handleMessage(msg2, fakeChannel, now);
    expect(res2.type).toBe('list');
    if (res2.type === 'list') {
      expect(res2.rows.some((r) => r.id === `date:${targetDate}`)).toBe(true);
    }

    // 3. Select Date
    const msg3: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'msg_3',
      kind: 'action',
      actionId: `date:${targetDate}`,
    };
    const res3 = await service.handleMessage(msg3, fakeChannel, now);
    expect(res3.type).toBe('list');
    if (res3.type === 'list') {
      // Offers "Siapa saja" and specific capsters
      expect(res3.rows.some((r) => r.id === 'capster:any')).toBe(true);
      expect(res3.rows.some((r) => r.id === `capster:${capster1Id}`)).toBe(true);
    }

    // 4. Select Capster
    const msg4: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'msg_4',
      kind: 'action',
      actionId: `capster:${capster1Id}`,
    };
    const res4 = await service.handleMessage(msg4, fakeChannel, now);
    expect(res4.type).toBe('list');
    if (res4.type === 'list') {
      expect(res4.rows.some((r) => r.id === 'slot:10:00')).toBe(true);
    }

    // 5. Select Slot
    const msg5: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'msg_5',
      kind: 'action',
      actionId: 'slot:10:00',
    };
    const res5 = await service.handleMessage(msg5, fakeChannel, now);
    expect(res5.type).toBe('buttons');
    if (res5.type === 'buttons') {
      expect(res5.text).toContain('Budi Senior');
      expect(res5.text).toContain('10:00');
      expect(res5.buttons.some((b) => b.id === 'confirm:yes')).toBe(true);
      expect(res5.buttons.some((b) => b.id === 'confirm:no')).toBe(true);
    }

    // 6. Confirm Booking
    const msg6: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'msg_6',
      kind: 'action',
      actionId: 'confirm:yes',
    };
    const res6 = await service.handleMessage(msg6, fakeChannel, now);
    expect(res6.type).toBe('buttons');
    if (res6.type === 'buttons') {
      expect(res6.text).toContain('Booking berhasil');
      expect(res6.text).toContain('Nomor Tiket:');
      expect(res6.text).toContain('BRB-');
    }

    // Verify booking is confirmed in database
    const dbBookings = await testDb.select().from(bookings);
    expect(dbBookings.length).toBe(1);
    expect(dbBookings[0].status).toBe('confirmed');
    expect(dbBookings[0].ticketCode).toMatch(/^BRB-/);
  });

  it('allows user to view their active bookings and cancel', async () => {
    // First, create a booking for the user
    const bookMsg1: InboundMessage = { channel: 'telegram', externalId: userChatId, messageId: 'm1', kind: 'text', text: '/start' };
    await service.handleMessage(bookMsg1, fakeChannel, now);

    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'm2', kind: 'action', actionId: 'menu:book' }, fakeChannel, now);
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'm3', kind: 'action', actionId: `date:${targetDate}` }, fakeChannel, now);
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'm4', kind: 'action', actionId: `capster:${capster1Id}` }, fakeChannel, now);
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'm5', kind: 'action', actionId: 'slot:11:00' }, fakeChannel, now);
    const confirmRes = await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'm6', kind: 'action', actionId: 'confirm:yes' }, fakeChannel, now);

    const [dbBooking] = await testDb.select().from(bookings);
    expect(dbBooking).toBeDefined();
    const ticketCode = dbBooking.ticketCode;

    // Now user selects "Booking Saya"
    const myBookingsRes = await service.handleMessage(
      { channel: 'telegram', externalId: userChatId, messageId: 'm7', kind: 'action', actionId: 'menu:mine' },
      fakeChannel,
      now
    );
    expect(myBookingsRes.type).toBe('list');
    if (myBookingsRes.type === 'list') {
      expect(myBookingsRes.rows.some((r) => r.id === `view:${ticketCode}`)).toBe(true);
    }

    // User views booking detail
    const detailRes = await service.handleMessage(
      { channel: 'telegram', externalId: userChatId, messageId: 'm8', kind: 'action', actionId: `view:${ticketCode}` },
      fakeChannel,
      now
    );
    expect(detailRes.type).toBe('buttons');
    if (detailRes.type === 'buttons') {
      expect(detailRes.buttons.some((b) => b.id === `cancel:${ticketCode}`)).toBe(true);
    }

    // User clicks Cancel
    const cancelPromptRes = await service.handleMessage(
      { channel: 'telegram', externalId: userChatId, messageId: 'm9', kind: 'action', actionId: `cancel:${ticketCode}` },
      fakeChannel,
      now
    );
    expect(cancelPromptRes.type).toBe('buttons');
    if (cancelPromptRes.type === 'buttons') {
      expect(cancelPromptRes.buttons.some((b) => b.id === `cancel_confirm:${ticketCode}`)).toBe(true);
    }

    // User confirms Cancellation
    const cancelDoneRes = await service.handleMessage(
      { channel: 'telegram', externalId: userChatId, messageId: 'm10', kind: 'action', actionId: `cancel_confirm:${ticketCode}` },
      fakeChannel,
      now
    );
    expect(cancelDoneRes.type).toBe('buttons');
    if (cancelDoneRes.type === 'buttons') {
      expect(cancelDoneRes.text).toContain('berhasil dibatalkan');
    }

    // Verify in DB that status is 'cancelled'
    const [updatedDbBooking] = await testDb.select().from(bookings);
    expect(updatedDbBooking.status).toBe('cancelled');
  });

  it('handles stale button presses gracefully without erroring', async () => {
    // User is in IDLE state, but sends an action from an old confirmation button
    const staleMsg: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 'stale_1',
      kind: 'action',
      actionId: 'confirm:yes',
    };

    const reply = await service.handleMessage(staleMsg, fakeChannel, now);
    expect(reply).toBeDefined();
    expect(reply.type).toBe('buttons');
  });

  it('resets session to IDLE after 30 minutes of inactivity (session timeout)', async () => {
    // Step 1: User starts date selection
    await service.handleMessage(
      { channel: 'telegram', externalId: userChatId, messageId: 't1', kind: 'action', actionId: 'menu:book' },
      fakeChannel,
      now
    );

    // 35 minutes later
    const futureTime = new Date(now.getTime() + 35 * 60 * 1000);

    // User sends a message
    const timeoutMsg: InboundMessage = {
      channel: 'telegram',
      externalId: userChatId,
      messageId: 't2',
      kind: 'text',
      text: 'Lanjut booking kemarin',
    };

    const reply = await service.handleMessage(timeoutMsg, fakeChannel, futureTime);
    expect(reply.type).toBe('buttons');
    // Replied with main menu
    if (reply.type === 'buttons') {
      expect(reply.buttons.some((b) => b.id === 'menu:book')).toBe(true);
    }
  });

  it('handles slot clash during confirmation if another customer booked the slot first', async () => {
    // 1. User starts booking flow and reaches confirmation
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'c1', kind: 'action', actionId: 'menu:book' }, fakeChannel, now);
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'c2', kind: 'action', actionId: `date:${targetDate}` }, fakeChannel, now);
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'c3', kind: 'action', actionId: `capster:${capster1Id}` }, fakeChannel, now);
    await service.handleMessage({ channel: 'telegram', externalId: userChatId, messageId: 'c4', kind: 'action', actionId: 'slot:10:00' }, fakeChannel, now);

    // 2. Another user (e.g. walkin / rival customer) takes that slot right before confirmation
    await createBooking(
      {
        branchId,
        capsterId: capster1Id,
        startsAt: parseJakartaDateTime(targetDate, '10:00'),
        source: 'walkin',
        now,
      },
      testDb
    );

    // 3. User clicks "Ya, booking"
    const clashRes = await service.handleMessage(
      { channel: 'telegram', externalId: userChatId, messageId: 'c5', kind: 'action', actionId: 'confirm:yes' },
      fakeChannel,
      now
    );

    // Bot detects clash and returns to slot picker with notification
    expect(clashRes.type).toBe('list');
    if (clashRes.type === 'list') {
      expect(clashRes.text).toContain('baru saja terisi');
    }
  });
});
