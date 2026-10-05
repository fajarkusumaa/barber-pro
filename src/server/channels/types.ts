import 'server-only';
import { ChannelName, OutboundMessage } from '../messaging/types';

export interface Channel {
  readonly name: ChannelName;
  send(to: string, message: OutboundMessage): Promise<void>;
  answerAction?(callbackQueryId: string, text?: string): Promise<void>;
}
