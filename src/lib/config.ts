export interface BookingConfig {
  slotIntervalMinutes: number;
  defaultDurationMinutes: number;
  bufferMinutes: number;
  minLeadMinutes: number;
  maxDaysAhead: number;
  sessionTimeoutMinutes: number;
  ticketPrefix: string;
  shopName: string;
  timeZone: string;
}

export const bookingConfig: BookingConfig = {
  slotIntervalMinutes: 30,
  defaultDurationMinutes: 30,
  bufferMinutes: 0,
  minLeadMinutes: 60,
  maxDaysAhead: 7,
  sessionTimeoutMinutes: 30,
  ticketPrefix: 'BRB',
  shopName: 'BarberBot',
  timeZone: 'Asia/Jakarta',
};
