import 'server-only';
import { Channel } from './types';
import { InboundMessage, OutboundMessage } from '../messaging/types';
import { env } from '@/lib/env';
import { db, chatMessages, Database } from '@/db';
import { eq, and } from 'drizzle-orm';


const TELEGRAM_API_BASE = 'https://api.telegram.org';

export class TelegramChannel implements Channel {
  readonly name = 'telegram' as const;
  private botToken: string;

  constructor(botToken = env.TELEGRAM_BOT_TOKEN) {
    if (!botToken) {
      // In dev or test environments where bot token might be empty, warn instead of throwing
      this.botToken = '';
    } else {
      this.botToken = botToken;
    }
  }

  private getApiUrl(method: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.botToken}/${method}`;
  }

  /**
   * Sends an outbound message to Telegram.
   */
  async send(to: string, message: OutboundMessage): Promise<void> {
    if (!this.botToken) {
      console.warn(`[TelegramChannel] Bot token not configured. Skipping send to ${to}`);
      return;
    }

    let payload: Record<string, unknown> = {
      chat_id: to,
      text: message.text,
      parse_mode: 'HTML',
    };

    if (message.type === 'buttons') {
      // Buttons in one single horizontal row (or up to 3 buttons)
      const inlineKeyboardRow = message.buttons.map((b) => ({
        text: b.title,
        callback_data: b.id,
      }));

      payload.reply_markup = {
        inline_keyboard: [inlineKeyboardRow],
      };
    } else if (message.type === 'list') {
      // List rendered as one button per row
      const inlineKeyboard = message.rows.map((r) => [
        {
          text: r.description ? `${r.title} (${r.description})` : r.title,
          callback_data: r.id,
        },
      ]);

      payload.reply_markup = {
        inline_keyboard: inlineKeyboard,
      };
    }

    const response = await fetch(this.getApiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TelegramChannel] sendMessage failed: ${response.status} ${errorText}`);
    }
  }

  /**
   * Answers a callback_query to stop the button loading spinner on Telegram client.
   */
  async answerAction(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.botToken) return;

    try {
      await fetch(this.getApiUrl('answerCallbackQuery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text ?? undefined,
        }),
      });
    } catch (err) {
      console.error('[TelegramChannel] answerCallbackQuery error:', err);
    }
  }
}

/**
 * Normalizes raw Telegram update payload into a neutral InboundMessage.
 */
export function normalizeTelegramUpdate(update: any): InboundMessage | null {
  if (!update || typeof update !== 'object') return null;

  const messageId = String(update.update_id);

  // 1. Callback query (Button / List selection)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (!chatId) return null;

    return {
      channel: 'telegram',
      externalId: String(chatId),
      messageId,
      name: cq.from?.first_name ? `${cq.from.first_name} ${cq.from.last_name ?? ''}`.trim() : undefined,
      kind: 'action',
      actionId: cq.data,
      callbackQueryId: cq.id,
    };
  }

  // 2. Standard chat message (Text)
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat?.id;
    if (!chatId) return null;

    return {
      channel: 'telegram',
      externalId: String(chatId),
      messageId,
      name: msg.from?.first_name ? `${msg.from.first_name} ${msg.from.last_name ?? ''}`.trim() : undefined,
      kind: 'text',
      text: msg.text ?? '',
    };
  }

  return null;
}

/**
 * Deduplicates inbound messages via database insert ON CONFLICT DO NOTHING.
 * Returns true if the message is unique and safe to process, false if duplicate.
 */
export async function deduplicateInboundMessage(
  msg: InboundMessage,
  database: Database = db as any
): Promise<boolean> {

  try {
    const result = await database
      .insert(chatMessages)
      .values({
        channel: msg.channel,
        externalMessageId: msg.messageId,
        direction: 'in',
        type: msg.kind,
        payload: {
          text: msg.text,
          actionId: msg.actionId,
        },
      })
      .onConflictDoNothing({
        target: [chatMessages.channel, chatMessages.externalMessageId],
      })
      .returning({ id: chatMessages.id });

    // If 0 rows returned, it means a conflict occurred (already processed)
    return result.length > 0;
  } catch (err) {
    console.error('[deduplicateInboundMessage] Error:', err);
    // On unexpected database error, allow retry
    return true;
  }
}
