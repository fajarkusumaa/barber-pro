import { after } from 'next/server';
import { env } from '@/lib/env';
import {
  TelegramChannel,
  normalizeTelegramUpdate,
  deduplicateInboundMessage,
} from '@/server/channels/telegram';
import { ConversationService } from '@/server/bot/conversation';

export const runtime = 'nodejs';

const telegramChannel = new TelegramChannel();
const conversationService = new ConversationService();

export async function POST(req: Request) {
  // 1. Verify Telegram Webhook Secret Token
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    if (secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 403 });
    }
  }

  let update: any;
  try {
    update = await req.json();
  } catch (err) {
    return new Response('invalid json', { status: 400 });
  }

  // 2. Process asynchronously after returning 200 OK quickly
  after(async () => {
    try {
      const inbound = normalizeTelegramUpdate(update);
      if (!inbound) return;

      // Deduplicate update_id
      const isUnique = await deduplicateInboundMessage(inbound);
      if (!isUnique) {
        console.log(`[Telegram Webhook] Duplicate update ${inbound.messageId} ignored.`);
        return;
      }

      // Handle message in conversation engine
      await conversationService.handleMessage(inbound, telegramChannel);
    } catch (err) {
      console.error('[Telegram Webhook] Error processing update:', err);
    }
  });

  return new Response('ok', { status: 200 });
}
