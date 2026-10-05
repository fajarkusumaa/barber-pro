const UNAMBIGUOUS_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a unique, customer-friendly ticket code.
 * Example: BRB-7K2P
 * Uses a charset without easily confused characters (0, O, 1, I).
 */
export function generateTicketCode(prefix: string = 'BRB', length: number = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * UNAMBIGUOUS_CHARS.length);
    code += UNAMBIGUOUS_CHARS[randomIndex];
  }
  return `${prefix}-${code}`;
}
