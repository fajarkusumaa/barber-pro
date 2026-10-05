import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();


import { env } from '../src/lib/env';
import {
  TelegramChannel,
  normalizeTelegramUpdate,
  deduplicateInboundMessage,
} from '../src/server/channels/telegram';
import { ConversationService } from '../src/server/bot/conversation';

const token = env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required in .env for telegram-poll.ts');
  process.exit(1);
}

const telegramChannel = new TelegramChannel(token);
const conversationService = new ConversationService();

const API_BASE = `https://api.telegram.org/bot${token}`;

async function deleteWebhook() {
  console.log('🔄 Clearing any active webhook before starting polling...');
  const res = await fetch(`${API_BASE}/deleteWebhook?drop_pending_updates=true`);
  const data = await res.json();
  console.log('✅ Webhook deleted:', data);
}

async function startPolling() {
  await deleteWebhook();
  console.log('🚀 BarberBot Telegram Polling started. Listening for updates... (Press Ctrl+C to stop)');

  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${API_BASE}/getUpdates?offset=${offset}&timeout=25`);
      if (!res.ok) {
        console.error(`❌ getUpdates failed: ${res.status}`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const body = (await res.json()) as { ok: boolean; result: any[] };
      if (body.ok && Array.isArray(body.result)) {
        for (const update of body.result) {
          offset = update.update_id + 1;

          const inbound = normalizeTelegramUpdate(update);
          if (!inbound) continue;

          console.log(`📩 Incoming [${inbound.kind}] from ${inbound.externalId} (${inbound.name ?? 'Guest'}): ${inbound.text || inbound.actionId}`);

          const isUnique = await deduplicateInboundMessage(inbound);
          if (!isUnique) {
            console.log(`⏩ Duplicate update ${inbound.messageId} skipped.`);
            continue;
          }

          await conversationService.handleMessage(inbound, telegramChannel);
        }
      }
    } catch (err) {
      console.error('❌ Error during polling loop:', err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

startPolling().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
