import 'server-only';
import { OutboundMessage, OutboundButton, OutboundListRow } from './types';

const MAX_BODY_LENGTH = 1024;
const MAX_BUTTONS_COUNT = 3;
const MAX_BUTTON_TITLE_LENGTH = 20;
const MAX_LIST_ROWS_COUNT = 10;
const MAX_LIST_ROW_TITLE_LENGTH = 24;
const MAX_LIST_ROW_DESC_LENGTH = 72;

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export class MessageBuilder {
  /**
   * Builds a plain text outbound message.
   */
  static text(content: string): OutboundMessage {
    return {
      type: 'text',
      text: truncate(content.trim(), MAX_BODY_LENGTH),
    };
  }

  /**
   * Builds an interactive buttons message (max 3 buttons).
   * Enforces WhatsApp length limits across all channels.
   */
  static buttons(
    bodyText: string,
    buttonItems: { id: string; title: string }[]
  ): OutboundMessage {
    const limitedButtons: OutboundButton[] = buttonItems
      .slice(0, MAX_BUTTONS_COUNT)
      .map((b) => ({
        id: b.id,
        title: truncate(b.title.trim(), MAX_BUTTON_TITLE_LENGTH),
      }));

    return {
      type: 'buttons',
      text: truncate(bodyText.trim(), MAX_BODY_LENGTH),
      buttons: limitedButtons,
    };
  }

  /**
   * Builds an interactive list message (max 10 rows).
   * Enforces WhatsApp length limits across all channels.
   */
  static list(
    bodyText: string,
    buttonLabel: string,
    rowItems: { id: string; title: string; description?: string }[]
  ): OutboundMessage {
    const limitedRows: OutboundListRow[] = rowItems
      .slice(0, MAX_LIST_ROWS_COUNT)
      .map((r) => ({
        id: r.id,
        title: truncate(r.title.trim(), MAX_LIST_ROW_TITLE_LENGTH),
        ...(r.description
          ? { description: truncate(r.description.trim(), MAX_LIST_ROW_DESC_LENGTH) }
          : {}),
      }));

    return {
      type: 'list',
      text: truncate(bodyText.trim(), MAX_BODY_LENGTH),
      buttonLabel: truncate(buttonLabel.trim(), MAX_BUTTON_TITLE_LENGTH),
      rows: limitedRows,
    };
  }
}
