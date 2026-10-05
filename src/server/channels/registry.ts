import 'server-only';
import { Channel } from './types';
import { ChannelName } from '../messaging/types';
import { TelegramChannel } from './telegram';

let telegram: TelegramChannel | null = null;

/** Resolves the outbound channel for proactive messages (e.g. admin cancellation). */
export function resolveChannel(name: ChannelName): Channel | null {
  if (name === 'telegram') {
    telegram ??= new TelegramChannel();
    return telegram;
  }
  // WhatsApp arrives in Phase 5
  return null;
}
