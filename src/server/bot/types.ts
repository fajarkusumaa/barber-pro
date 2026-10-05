import 'server-only';

export type BotState =
  | 'IDLE'
  | 'CHOOSING_DATE'
  | 'CHOOSING_CAPSTER'
  | 'CHOOSING_TIME_GROUP'
  | 'CHOOSING_TIME'
  | 'CONFIRMING'
  | 'VIEWING_MY_BOOKINGS'
  | 'CONFIRMING_CANCEL';

export interface SessionContext {
  [key: string]: unknown;
  branchId?: number;
  selectedDate?: string; // 'YYYY-MM-DD'
  selectedCapsterId?: number | 'any';
  selectedCapsterName?: string;
  selectedTimeGroup?: 'morning' | 'afternoon' | 'evening';
  selectedTimeSlot?: string; // 'HH:mm'
  selectedTicketCode?: string;
}

export interface CustomerSession {
  customerId: number;
  customerName?: string;
  state: BotState;
  context: SessionContext;
  lastActivityAt: Date;
}
