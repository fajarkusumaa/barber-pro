import {
  pgTable,
  bigint,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Branches
export const branches = pgTable('branches', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  address: text('address'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 2. Capsters (Barbers)
export const capsters = pgTable('capsters', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  branchId: bigint('branch_id', { mode: 'number' })
    .notNull()
    .references(() => branches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 3. Capster Schedules (Working Hours / Break Hours)
export const capsterSchedules = pgTable('capster_schedules', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  capsterId: bigint('capster_id', { mode: 'number' })
    .notNull()
    .references(() => capsters.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: text('start_time').notNull(), // e.g. '09:00'
  endTime: text('end_time').notNull(), // e.g. '17:00'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 4. Time Offs (Leaves & Quick Busy 30 mins)
export const timeOffs = pgTable('time_offs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  capsterId: bigint('capster_id', { mode: 'number' })
    .notNull()
    .references(() => capsters.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 5. Customers
export const customers = pgTable(
  'customers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    channel: text('channel', { enum: ['telegram', 'whatsapp'] }).notNull(),
    externalId: text('external_id').notNull(),
    name: text('name'),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('customers_channel_external_id_idx').on(table.channel, table.externalId),
  ]
);

// 6. Bookings
export const bookings = pgTable(
  'bookings',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ticketCode: varchar('ticket_code', { length: 16 }).notNull().unique(),
    customerId: bigint('customer_id', { mode: 'number' }).references(() => customers.id, {
      onDelete: 'set null',
    }),
    guestName: text('guest_name'),
    branchId: bigint('branch_id', { mode: 'number' })
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    capsterId: bigint('capster_id', { mode: 'number' })
      .notNull()
      .references(() => capsters.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status', {
      enum: ['confirmed', 'completed', 'no_show', 'cancelled'],
    })
      .notNull()
      .default('confirmed'),
    source: text('source', { enum: ['bot', 'admin', 'walkin'] }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bookings_capster_starts_at_idx').on(table.capsterId, table.startsAt),
    index('bookings_branch_starts_at_idx').on(table.branchId, table.startsAt),
    index('bookings_status_starts_at_idx').on(table.status, table.startsAt),
  ]
);

// 7. Chat Sessions
export const chatSessions = pgTable('chat_sessions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  customerId: bigint('customer_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => customers.id, { onDelete: 'cascade' }),
  state: text('state').notNull().default('IDLE'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 8. Chat Messages
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    channel: text('channel', { enum: ['telegram', 'whatsapp'] }).notNull(),
    externalMessageId: text('external_message_id').notNull(),
    customerId: bigint('customer_id', { mode: 'number' }).references(() => customers.id, {
      onDelete: 'set null',
    }),
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chat_messages_channel_msg_id_idx').on(table.channel, table.externalMessageId),
  ]
);

// 9. Admin Users (dashboard & /device login)
export const adminUsers = pgTable('admin_users', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const branchesRelations = relations(branches, ({ many }) => ({
  capsters: many(capsters),
  bookings: many(bookings),
}));

export const capstersRelations = relations(capsters, ({ one, many }) => ({
  branch: one(branches, {
    fields: [capsters.branchId],
    references: [branches.id],
  }),
  schedules: many(capsterSchedules),
  timeOffs: many(timeOffs),
  bookings: many(bookings),
}));

export const capsterSchedulesRelations = relations(capsterSchedules, ({ one }) => ({
  capster: one(capsters, {
    fields: [capsterSchedules.capsterId],
    references: [capsters.id],
  }),
}));

export const timeOffsRelations = relations(timeOffs, ({ one }) => ({
  capster: one(capsters, {
    fields: [timeOffs.capsterId],
    references: [capsters.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  session: one(chatSessions, {
    fields: [customers.id],
    references: [chatSessions.customerId],
  }),
  messages: many(chatMessages),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  branch: one(branches, {
    fields: [bookings.branchId],
    references: [branches.id],
  }),
  capster: one(capsters, {
    fields: [bookings.capsterId],
    references: [capsters.id],
  }),
  customer: one(customers, {
    fields: [bookings.customerId],
    references: [customers.id],
  }),
}));

// Export Types
export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

export type Capster = typeof capsters.$inferSelect;
export type NewCapster = typeof capsters.$inferInsert;

export type CapsterSchedule = typeof capsterSchedules.$inferSelect;
export type NewCapsterSchedule = typeof capsterSchedules.$inferInsert;

export type TimeOff = typeof timeOffs.$inferSelect;
export type NewTimeOff = typeof timeOffs.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
