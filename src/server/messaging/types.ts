import 'server-only';

export type ChannelName = 'telegram' | 'whatsapp';

export interface InboundMessage {
  channel: ChannelName;
  externalId: string; // chat id Telegram / wa_id WhatsApp
  messageId: string; // update_id / wamid, for deduplication
  name?: string;
  kind: 'text' | 'action';
  text?: string;
  actionId?: string;
  callbackQueryId?: string; // Telegram callback_query id for answerCallbackQuery
}

export type OutboundButton = {
  id: string; // max 20 chars
  title: string; // max 20 chars
};

export type OutboundListRow = {
  id: string; // max 200 chars
  title: string; // max 24 chars
  description?: string; // max 72 chars
};

export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'buttons'; text: string; buttons: OutboundButton[] } // max 3 buttons
  | { type: 'list'; text: string; buttonLabel: string; rows: OutboundListRow[] }; // max 10 rows
