import { describe, it, expect } from 'vitest';
import { MessageBuilder } from '@/server/messaging/builder';

describe('MessageBuilder (WhatsApp and Cross-Channel Constraints)', () => {
  it('creates text message within body limits', () => {
    const msg = MessageBuilder.text('Hello BarberBot');
    expect(msg.type).toBe('text');
    expect(msg.text).toBe('Hello BarberBot');
  });

  it('truncates text message exceeding 1024 characters', () => {
    const longText = 'a'.repeat(1200);
    const msg = MessageBuilder.text(longText);
    expect(msg.text.length).toBe(1024);
    expect(msg.text.endsWith('…')).toBe(true);
  });

  it('enforces buttons limits (max 3 buttons and 20 chars title)', () => {
    const buttons = [
      { id: '1', title: 'A very long title that exceeds twenty chars' },
      { id: '2', title: 'Button 2' },
      { id: '3', title: 'Button 3' },
      { id: '4', title: 'Button 4 (should be dropped)' },
    ];

    const msg = MessageBuilder.buttons('Pick an option', buttons);
    expect(msg.type).toBe('buttons');
    if (msg.type === 'buttons') {
      expect(msg.buttons.length).toBe(3);
      expect(msg.buttons[0].title.length).toBeLessThanOrEqual(20);
      expect(msg.buttons[0].title.endsWith('…')).toBe(true);
      expect(msg.buttons.some((b) => b.id === '4')).toBe(false);
    }
  });

  it('enforces list limits (max 10 rows, title max 24, description max 72)', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      id: `row_${i}`,
      title: `Very Long Row Title #${i} That Exceeds 24 Chars`,
      description: 'D'.repeat(100),
    }));

    const msg = MessageBuilder.list('Pick a slot', 'Pilih Jam', rows);
    expect(msg.type).toBe('list');
    if (msg.type === 'list') {
      expect(msg.rows.length).toBe(10);
      expect(msg.rows[0].title.length).toBeLessThanOrEqual(24);
      expect(msg.rows[0].description?.length).toBeLessThanOrEqual(72);
      expect(msg.buttonLabel.length).toBeLessThanOrEqual(20);
    }
  });
});
