import 'server-only';
import { Channel } from './types';
import { ChannelName, OutboundMessage } from '../messaging/types';

export interface SentMessageEntry {
  to: string;
  message: OutboundMessage;
  timestamp: Date;
}

export class FakeChannel implements Channel {
  readonly name: ChannelName;
  public sentMessages: SentMessageEntry[] = [];
  public answeredCallbacks: { callbackQueryId: string; text?: string }[] = [];

  constructor(name: ChannelName = 'telegram') {
    this.name = name;
  }

  async send(to: string, message: OutboundMessage): Promise<void> {
    this.sentMessages.push({
      to,
      message,
      timestamp: new Date(),
    });
  }

  async answerAction(callbackQueryId: string, text?: string): Promise<void> {
    this.answeredCallbacks.push({ callbackQueryId, text });
  }

  getLastMessage(): OutboundMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1]?.message;
  }

  getLastMessageTo(to: string): OutboundMessage | undefined {
    const userMessages = this.sentMessages.filter((m) => m.to === to);
    return userMessages[userMessages.length - 1]?.message;
  }

  clear() {
    this.sentMessages = [];
    this.answeredCallbacks = [];
  }
}
