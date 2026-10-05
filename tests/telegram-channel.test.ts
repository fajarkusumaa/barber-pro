import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeTelegramUpdate,
  deduplicateInboundMessage,
} from '@/server/channels/telegram';
import { createTestDatabase } from './helpers/test-db';
import { Database } from '@/db';

describe('TelegramChannel & Update Normalizer', () => {
  let testDb: Database;

  beforeEach(async () => {
    const { db } = await createTestDatabase();
    testDb = db;
  });

  it('normalizes standard Telegram text message update', () => {
    const rawUpdate = {
      update_id: 1001,
      message: {
        message_id: 42,
        from: { id: 123456, is_bot: false, first_name: 'Budi', last_name: 'Santoso' },
        chat: { id: 123456, first_name: 'Budi', type: 'private' },
        date: 1728100000,
        text: '/start',
      },
    };

    const normalized = normalizeTelegramUpdate(rawUpdate);
    expect(normalized).toEqual({
      channel: 'telegram',
      externalId: '123456',
      messageId: '1001',
      name: 'Budi Santoso',
      kind: 'text',
      text: '/start',
    });
  });

  it('normalizes Telegram callback_query (button action) update', () => {
    const rawUpdate = {
      update_id: 1002,
      callback_query: {
        id: 'cbq_999',
        from: { id: 123456, first_name: 'Budi' },
        message: {
          message_id: 43,
          chat: { id: 123456, type: 'private' },
        },
        data: 'menu:book',
      },
    };

    const normalized = normalizeTelegramUpdate(rawUpdate);
    expect(normalized).toEqual({
      channel: 'telegram',
      externalId: '123456',
      messageId: '1002',
      name: 'Budi',
      kind: 'action',
      actionId: 'menu:book',
      callbackQueryId: 'cbq_999',
    });
  });

  it('deduplicates incoming updates so identical message IDs are not processed twice', async () => {
    const inbound = {
      channel: 'telegram' as const,
      externalId: '123456',
      messageId: 'update_555',
      kind: 'text' as const,
      text: 'Halo',
    };

    // First time -> unique
    const firstAttempt = await deduplicateInboundMessage(inbound, testDb);
    expect(firstAttempt).toBe(true);

    // Second time with identical messageId -> duplicate
    const secondAttempt = await deduplicateInboundMessage(inbound, testDb);
    expect(secondAttempt).toBe(false);
  });
});
