import 'server-only';
import { db as defaultDb, Database, branches, capsters, bookings, Capster, Booking } from '@/db';
import { eq, and, ne, gte, desc, asc } from 'drizzle-orm';
import { InboundMessage, OutboundMessage } from '../messaging/types';
import { Channel } from '../channels/types';
import { MessageBuilder } from '../messaging/builder';
import { botTexts } from './texts.id';
import { BotState, SessionContext, CustomerSession } from './types';
import { resolveCustomerAndSession, saveSession } from './session';
import {
  getCapsterAvailability,
  getAvailableSlotsForAny,
  getAvailableCapstersForDate,
  TimeSlot,
  MergedTimeSlot,
} from '../booking/availability';
import { createBooking, cancelBooking } from '../booking/booking';
import {
  parseJakartaDateTime,
  getJakartaDateString,
  getJakartaTimeString,
  formatJakartaDisplayDate,
  addDaysJakarta,
} from '@/lib/time';
import { bookingConfig } from '@/lib/config';

export class ConversationService {
  constructor(private database: Database = defaultDb) {}

  /**
   * Main entrypoint to process an incoming inbound message from any channel.
   */
  async handleMessage(
    msg: InboundMessage,
    channel: Channel,
    now: Date = new Date()
  ): Promise<OutboundMessage> {
    // 1. Resolve customer and session state
    const { customer, session } = await resolveCustomerAndSession(
      msg,
      this.database,
      now
    );

    // 2. Answer callback query if present (Telegram UX)
    if (msg.callbackQueryId && channel.answerAction) {
      await channel.answerAction(msg.callbackQueryId);
    }

    // 3. Check for Global Reset Commands (/start, menu, halo, hai)
    if (msg.kind === 'text' && msg.text) {
      const cleanText = msg.text.trim().toLowerCase();
      if (['/start', 'menu', 'halo', 'hai', 'bantuan', 'start'].includes(cleanText)) {
        await saveSession(customer.id, 'IDLE', {}, this.database, now);
        const reply = this.renderMainMenu();
        await channel.send(msg.externalId, reply);
        return reply;
      }
    }

    // 4. Dispatch according to current state or action
    let reply: OutboundMessage;

    try {
      reply = await this.dispatch(msg, customer.id, session, now);
    } catch (err) {
      console.error('[ConversationService] Dispatch error:', err);
      reply = MessageBuilder.buttons(botTexts.welcome(), [
        { id: 'menu:book', title: botTexts.menuBookButton },
        { id: 'menu:mine', title: botTexts.menuMineButton },
      ]);
      await saveSession(customer.id, 'IDLE', {}, this.database, now);
    }

    // 5. Send outbound reply via channel
    await channel.send(msg.externalId, reply);
    return reply;
  }

  private async dispatch(
    msg: InboundMessage,
    customerId: number,
    session: CustomerSession,
    now: Date
  ): Promise<OutboundMessage> {
    const actionId = msg.actionId ?? '';
    const { state, context } = session;

    // Handle Explicit Global Action Menus
    if (actionId === 'menu:main') {
      await saveSession(customerId, 'IDLE', {}, this.database, now);
      return this.renderMainMenu();
    }

    if (actionId === 'menu:book') {
      return this.startBookingFlow(customerId, now);
    }

    if (actionId === 'menu:mine') {
      return this.renderMyBookings(customerId, now);
    }

    // State Machine Transitions
    switch (state) {
      case 'IDLE': {
        if (actionId === 'menu:book') {
          return this.startBookingFlow(customerId, now);
        }
        if (actionId === 'menu:mine') {
          return this.renderMyBookings(customerId, now);
        }
        return this.renderMainMenu();
      }

      case 'CHOOSING_DATE': {
        if (actionId.startsWith('date:')) {
          const selectedDate = actionId.replace('date:', '');
          return this.handleDateSelected(customerId, selectedDate, context, now);
        }
        // Fallback for free text / stale button
        return this.startBookingFlow(customerId, now, botTexts.invalidAction);
      }

      case 'CHOOSING_CAPSTER': {
        if (actionId.startsWith('capster:')) {
          const capsterRaw = actionId.replace('capster:', '');
          const capsterId = capsterRaw === 'any' ? 'any' : parseInt(capsterRaw, 10);
          return this.handleCapsterSelected(customerId, capsterId, context, now);
        }
        // Fallback
        return this.renderCapsterSelection(customerId, context.selectedDate!, context, now, botTexts.invalidAction);
      }

      case 'CHOOSING_TIME_GROUP': {
        if (actionId.startsWith('tg:')) {
          const timeGroup = actionId.replace('tg:', '') as 'morning' | 'afternoon' | 'evening';
          return this.handleTimeGroupSelected(customerId, timeGroup, context, now);
        }
        return this.renderTimeGroupSelection(customerId, context, now, botTexts.invalidAction);
      }

      case 'CHOOSING_TIME': {
        if (actionId.startsWith('slot:')) {
          const slotTime = actionId.replace('slot:', '');
          return this.handleSlotSelected(customerId, slotTime, context, now);
        }
        return this.renderSlotSelection(customerId, context, now, botTexts.invalidAction);
      }

      case 'CONFIRMING': {
        if (actionId === 'confirm:yes') {
          return this.handleConfirmBooking(customerId, context, now);
        }
        if (actionId === 'confirm:no' || actionId === 'confirm:change') {
          return this.startBookingFlow(customerId, now);
        }
        return this.renderConfirmation(customerId, context, now, botTexts.invalidAction);
      }

      case 'VIEWING_MY_BOOKINGS': {
        if (actionId.startsWith('view:')) {
          const ticketCode = actionId.replace('view:', '');
          return this.renderBookingDetail(customerId, ticketCode, now);
        }
        if (actionId.startsWith('cancel:')) {
          const ticketCode = actionId.replace('cancel:', '');
          return this.renderCancelConfirmation(customerId, ticketCode, now);
        }

        return this.renderMyBookings(customerId, now);
      }

      case 'CONFIRMING_CANCEL': {
        if (actionId.startsWith('cancel_confirm:')) {
          const ticketCode = actionId.replace('cancel_confirm:', '');
          return this.handleCancelConfirmed(customerId, ticketCode, now);
        }
        if (actionId === 'cancel_back') {
          return this.renderMyBookings(customerId, now);
        }
        return this.renderMyBookings(customerId, now);
      }

      default:
        await saveSession(customerId, 'IDLE', {}, this.database, now);
        return this.renderMainMenu();
    }
  }

  // --- Step 1: Main Menu ---
  private renderMainMenu(): OutboundMessage {
    return MessageBuilder.buttons(botTexts.welcome(), [
      { id: 'menu:book', title: botTexts.menuBookButton },
      { id: 'menu:mine', title: botTexts.menuMineButton },
    ]);
  }

  // --- Step 2: Date Selection ---
  private async startBookingFlow(
    customerId: number,
    now: Date,
    prefixNotice?: string
  ): Promise<OutboundMessage> {
    const defaultBranchId = 1;
    const maxDays = bookingConfig.maxDaysAhead;
    const rows: { id: string; title: string; description?: string }[] = [];

    for (let i = 0; i < maxDays; i++) {
      const d = addDaysJakarta(now, i);
      const dateStr = getJakartaDateString(d);
      const display = formatJakartaDisplayDate(d);
      const label = i === 0 ? `Hari Ini (${display})` : i === 1 ? `Besok (${display})` : display;

      rows.push({
        id: `date:${dateStr}`,
        title: label,
      });
    }

    await saveSession(
      customerId,
      'CHOOSING_DATE',
      { branchId: defaultBranchId },
      this.database,
      now
    );

    const text = prefixNotice ? `${prefixNotice}\n\n${botTexts.chooseDate}` : botTexts.chooseDate;
    return MessageBuilder.list(text, 'Pilih Tanggal', rows);
  }

  // --- Step 3: Capster Selection ---
  private async handleDateSelected(
    customerId: number,
    selectedDate: string,
    context: SessionContext,
    now: Date
  ): Promise<OutboundMessage> {
    const branchId = context.branchId ?? 1;
    const updatedContext: SessionContext = {
      ...context,
      branchId,
      selectedDate,
    };

    return this.renderCapsterSelection(customerId, selectedDate, updatedContext, now);
  }

  private async renderCapsterSelection(
    customerId: number,
    selectedDate: string,
    context: SessionContext,
    now: Date,
    prefixNotice?: string
  ): Promise<OutboundMessage> {
    const branchId = context.branchId ?? 1;
    const availableCapsters = await getAvailableCapstersForDate(
      {
        branchId,
        targetDate: selectedDate,
        now,
      },
      this.database
    );

    if (availableCapsters.length === 0) {
      return this.startBookingFlow(customerId, now, botTexts.noCapsterAvailable);
    }

    const rows: { id: string; title: string; description?: string }[] = [];

    // If more than 1 capster is available, add "Siapa saja" option
    if (availableCapsters.length > 1) {
      rows.push({
        id: 'capster:any',
        title: botTexts.capsterAny,
        description: 'Pilihan paling fleksibel',
      });
    }

    for (const c of availableCapsters) {
      rows.push({
        id: `capster:${c.id}`,
        title: c.name,
        description: `${c.availableSlotsCount} slot tersedia`,
      });
    }

    await saveSession(customerId, 'CHOOSING_CAPSTER', context, this.database, now);

    const text = prefixNotice
      ? `${prefixNotice}\n\n${botTexts.chooseCapster}`
      : botTexts.chooseCapster;

    return MessageBuilder.list(text, 'Pilih Kapster', rows);
  }

  // --- Step 4: Time Slot & Time Group Selection ---
  private async handleCapsterSelected(
    customerId: number,
    capsterId: number | 'any',
    context: SessionContext,
    now: Date
  ): Promise<OutboundMessage> {
    let capsterName = botTexts.capsterAny;

    if (capsterId !== 'any') {
      const [capster] = await this.database
        .select()
        .from(capsters)
        .where(eq(capsters.id, capsterId));
      if (capster) capsterName = capster.name;
    }

    const updatedContext: SessionContext = {
      ...context,
      selectedCapsterId: capsterId,
      selectedCapsterName: capsterName,
    };

    return this.renderSlotOrTimeGroup(customerId, updatedContext, now);
  }

  private async renderSlotOrTimeGroup(
    customerId: number,
    context: SessionContext,
    now: Date
  ): Promise<OutboundMessage> {
    const branchId = context.branchId ?? 1;
    const targetDate = context.selectedDate!;
    const capsterId = context.selectedCapsterId!;

    let slots: (TimeSlot | MergedTimeSlot)[] = [];

    if (capsterId === 'any') {
      slots = await getAvailableSlotsForAny(
        { branchId, targetDate, now },
        this.database
      );
    } else {
      slots = await getCapsterAvailability(
        { capsterId, targetDate, now },
        this.database
      );
    }

    if (slots.length === 0) {
      return this.renderCapsterSelection(
        customerId,
        targetDate,
        context,
        now,
        botTexts.noSlotsAvailable
      );
    }

    // If slot count <= 10, display direct slot list
    if (slots.length <= 10) {
      const rows = slots.map((s) => ({
        id: `slot:${s.timeString}`,
        title: `${s.timeString} WIB`,
      }));

      await saveSession(customerId, 'CHOOSING_TIME', context, this.database, now);
      return MessageBuilder.list(botTexts.chooseTimeSlot, 'Pilih Jam', rows);
    }

    // If slots > 10, ask user to choose time group (morning/afternoon/evening)
    return this.renderTimeGroupSelection(customerId, context, now);
  }

  private async renderTimeGroupSelection(
    customerId: number,
    context: SessionContext,
    now: Date,
    prefixNotice?: string
  ): Promise<OutboundMessage> {
    const branchId = context.branchId ?? 1;
    const targetDate = context.selectedDate!;
    const capsterId = context.selectedCapsterId!;

    let slots: (TimeSlot | MergedTimeSlot)[] = [];
    if (capsterId === 'any') {
      slots = await getAvailableSlotsForAny(
        { branchId, targetDate, now },
        this.database
      );
    } else {
      slots = await getCapsterAvailability(
        { capsterId, targetDate, now },
        this.database
      );
    }

    const morningCount = slots.filter((s) => s.group === 'morning').length;
    const afternoonCount = slots.filter((s) => s.group === 'afternoon').length;
    const eveningCount = slots.filter((s) => s.group === 'evening').length;

    const buttons: { id: string; title: string }[] = [];
    if (morningCount > 0) buttons.push({ id: 'tg:morning', title: 'Pagi (<12:00)' });
    if (afternoonCount > 0) buttons.push({ id: 'tg:afternoon', title: 'Siang (12-17)' });
    if (eveningCount > 0) buttons.push({ id: 'tg:evening', title: 'Sore (≥17:00)' });

    await saveSession(customerId, 'CHOOSING_TIME_GROUP', context, this.database, now);

    const text = prefixNotice
      ? `${prefixNotice}\n\n${botTexts.chooseTimeGroup}`
      : botTexts.chooseTimeGroup;

    return MessageBuilder.buttons(text, buttons);
  }

  private async handleTimeGroupSelected(
    customerId: number,
    timeGroup: 'morning' | 'afternoon' | 'evening',
    context: SessionContext,
    now: Date
  ): Promise<OutboundMessage> {
    const updatedContext: SessionContext = {
      ...context,
      selectedTimeGroup: timeGroup,
    };

    return this.renderSlotSelection(customerId, updatedContext, now);
  }

  private async renderSlotSelection(
    customerId: number,
    context: SessionContext,
    now: Date,
    prefixNotice?: string
  ): Promise<OutboundMessage> {
    const branchId = context.branchId ?? 1;
    const targetDate = context.selectedDate!;
    const capsterId = context.selectedCapsterId!;
    const timeGroup = context.selectedTimeGroup;

    let slots: (TimeSlot | MergedTimeSlot)[] = [];
    if (capsterId === 'any') {
      slots = await getAvailableSlotsForAny(
        { branchId, targetDate, now },
        this.database
      );
    } else {
      slots = await getCapsterAvailability(
        { capsterId, targetDate, now },
        this.database
      );
    }

    let filteredSlots = timeGroup ? slots.filter((s) => s.group === timeGroup) : slots;
    if (filteredSlots.length === 0) {
      filteredSlots = slots;
    }

    const rows = filteredSlots.slice(0, 10).map((s) => ({
      id: `slot:${s.timeString}`,
      title: `${s.timeString} WIB`,
    }));

    await saveSession(customerId, 'CHOOSING_TIME', context, this.database, now);

    const text = prefixNotice
      ? `${prefixNotice}\n\n${botTexts.chooseTimeSlot}`
      : botTexts.chooseTimeSlot;

    return MessageBuilder.list(text, 'Pilih Jam', rows);
  }

  // --- Step 5: Confirmation ---
  private async handleSlotSelected(
    customerId: number,
    slotTime: string,
    context: SessionContext,
    now: Date
  ): Promise<OutboundMessage> {
    const updatedContext: SessionContext = {
      ...context,
      selectedTimeSlot: slotTime,
    };

    return this.renderConfirmation(customerId, updatedContext, now);
  }

  private async renderConfirmation(
    customerId: number,
    context: SessionContext,
    now: Date,
    prefixNotice?: string
  ): Promise<OutboundMessage> {
    const targetDate = context.selectedDate!;
    const slotTime = context.selectedTimeSlot!;
    const capsterName = context.selectedCapsterName ?? 'Siapa saja';

    const dateObj = parseJakartaDateTime(targetDate, '00:00');
    const dateDisplay = formatJakartaDisplayDate(dateObj);

    const summaryText = botTexts.confirmBooking({
      capsterName,
      dateStr: dateDisplay,
      timeStr: slotTime,
    });

    const body = prefixNotice ? `${prefixNotice}\n\n${summaryText}` : summaryText;

    await saveSession(customerId, 'CONFIRMING', context, this.database, now);

    return MessageBuilder.buttons(body, [
      { id: 'confirm:yes', title: botTexts.btnConfirmYes },
      { id: 'confirm:no', title: botTexts.btnConfirmChange },
    ]);
  }

  // --- Step 6: Execute Booking ---
  private async handleConfirmBooking(
    customerId: number,
    context: SessionContext,
    now: Date
  ): Promise<OutboundMessage> {
    const branchId = context.branchId ?? 1;
    const targetDate = context.selectedDate!;
    const slotTime = context.selectedTimeSlot!;
    const capsterId = context.selectedCapsterId!;

    const startsAt = parseJakartaDateTime(targetDate, slotTime);

    const bookingResult = await createBooking(
      {
        branchId,
        capsterId,
        startsAt,
        customerId,
        source: 'bot',
        now,
      },
      this.database
    );

    if (!bookingResult.success) {
      // Slot clashed or unavailable -> return to slot picker
      return this.renderSlotSelection(customerId, context, now, botTexts.slotClashed);
    }

    // Success -> Ticket issued!
    const booking = bookingResult.booking;
    let finalCapsterName = context.selectedCapsterName ?? 'Barber';

    if (booking.capsterId) {
      const [c] = await this.database
        .select()
        .from(capsters)
        .where(eq(capsters.id, booking.capsterId));
      if (c) finalCapsterName = c.name;
    }

    const dateDisplay = formatJakartaDisplayDate(parseJakartaDateTime(targetDate, '00:00'));

    const successMessage = botTexts.ticketSuccess({
      ticketCode: booking.ticketCode,
      capsterName: finalCapsterName,
      dateStr: dateDisplay,
      timeStr: slotTime,
    });

    // Reset session to IDLE
    await saveSession(customerId, 'IDLE', {}, this.database, now);

    return MessageBuilder.buttons(successMessage, [
      { id: 'menu:mine', title: botTexts.menuMineButton },
      { id: 'menu:main', title: botTexts.btnBackToMenu },
    ]);
  }

  // --- "Booking Saya" & Cancellation ---
  private async renderMyBookings(
    customerId: number,
    now: Date
  ): Promise<OutboundMessage> {
    // 1 hour grace window
    const lookbackTime = new Date(now.getTime() - 60 * 60 * 1000);

    const activeBookings = await this.database
      .select({
        id: bookings.id,
        ticketCode: bookings.ticketCode,
        startsAt: bookings.startsAt,
        status: bookings.status,
        capsterId: bookings.capsterId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.customerId, customerId),
          ne(bookings.status, 'cancelled'),
          gte(bookings.startsAt, lookbackTime)
        )
      )
      .orderBy(asc(bookings.startsAt))
      .limit(10);

    if (activeBookings.length === 0) {
      await saveSession(customerId, 'IDLE', {}, this.database, now);
      return MessageBuilder.buttons(botTexts.noActiveBookings, [
        { id: 'menu:book', title: 'Booking Sekarang' },
        { id: 'menu:main', title: botTexts.btnBackToMenu },
      ]);
    }

    const rows = activeBookings.map((b) => {
      const dateStr = getJakartaDateString(new Date(b.startsAt));
      const timeStr = getJakartaTimeString(new Date(b.startsAt));
      return {
        id: `view:${b.ticketCode}`,
        title: `${b.ticketCode} (${timeStr})`,
        description: `${dateStr} - Status: ${b.status}`,
      };
    });

    await saveSession(customerId, 'VIEWING_MY_BOOKINGS', {}, this.database, now);
    return MessageBuilder.list(botTexts.myBookingsTitle, 'Lihat Reservasi', rows);
  }

  private async renderBookingDetail(
    customerId: number,
    ticketCode: string,
    now: Date
  ): Promise<OutboundMessage> {
    const [booking] = await this.database
      .select()
      .from(bookings)
      .where(and(eq(bookings.ticketCode, ticketCode), eq(bookings.customerId, customerId)));

    if (!booking) {
      return this.renderMyBookings(customerId, now);
    }

    let capsterName = 'Barber';
    if (booking.capsterId) {
      const [c] = await this.database
        .select()
        .from(capsters)
        .where(eq(capsters.id, booking.capsterId));
      if (c) capsterName = c.name;
    }

    const dateDisplay = formatJakartaDisplayDate(new Date(booking.startsAt));
    const timeDisplay = getJakartaTimeString(new Date(booking.startsAt));

    const text = botTexts.bookingDetail({
      ticketCode: booking.ticketCode,
      capsterName,
      dateStr: dateDisplay,
      timeStr: timeDisplay,
      status: booking.status,
    });

    await saveSession(
      customerId,
      'VIEWING_MY_BOOKINGS',
      { selectedTicketCode: ticketCode },
      this.database,
      now
    );

    const buttons = [
      { id: `cancel:${booking.ticketCode}`, title: botTexts.btnCancelBooking },
      { id: 'menu:main', title: botTexts.btnBackToMenu },
    ];

    return MessageBuilder.buttons(text, buttons);
  }

  private async renderCancelConfirmation(
    customerId: number,
    ticketCode: string,
    now: Date
  ): Promise<OutboundMessage> {
    await saveSession(
      customerId,
      'CONFIRMING_CANCEL',
      { selectedTicketCode: ticketCode },
      this.database,
      now
    );


    return MessageBuilder.buttons(botTexts.cancelConfirmation(ticketCode), [
      { id: `cancel_confirm:${ticketCode}`, title: botTexts.btnCancelConfirmYes },
      { id: 'cancel_back', title: botTexts.btnCancelConfirmNo },
    ]);
  }

  private async handleCancelConfirmed(
    customerId: number,
    ticketCode: string,
    now: Date
  ): Promise<OutboundMessage> {
    const cancelRes = await cancelBooking({ ticketCode, customerId }, this.database);

    await saveSession(customerId, 'IDLE', {}, this.database, now);

    if (!cancelRes.success) {
      return MessageBuilder.buttons('Gagal membatalkan booking.', [
        { id: 'menu:main', title: botTexts.btnBackToMenu },
      ]);
    }

    return MessageBuilder.buttons(botTexts.cancelSuccess(ticketCode), [
      { id: 'menu:book', title: 'Booking Baru' },
      { id: 'menu:main', title: botTexts.btnBackToMenu },
    ]);
  }
}
