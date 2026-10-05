import dotenv from 'dotenv';
dotenv.config();

import { env } from '../src/lib/env';

const token = env.TELEGRAM_BOT_TOKEN;
const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = env.APP_URL;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing in environment');
  process.exit(1);
}

if (!appUrl) {
  console.error('❌ APP_URL is missing in environment');
  process.exit(1);
}

const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhooks/telegram`;
const API_URL = `https://api.telegram.org/bot${token}/setWebhook`;

async function setWebhook() {
  console.log(`Setting Telegram webhook to: ${webhookUrl}`);

  const payload: Record<string, string> = {
    url: webhookUrl,
    drop_pending_updates: 'true',
  };

  if (webhookSecret) {
    payload.secret_token = webhookSecret;
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  if (result.ok) {
    console.log('✅ Webhook successfully registered with Telegram:', result);
  } else {
    console.error('❌ Failed to set webhook:', result);
    process.exit(1);
  }
}

setWebhook().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
