import 'server-only';
import { bookingConfig } from '@/lib/config';

export const botTexts = {
  // 1. Greeting & Main Menu
  welcome: (shopName: string = bookingConfig.shopName) =>
    `Halo! Selamat datang di <b>${shopName}</b> 👋\nMau ngapain hari ini?`,

  menuBookButton: 'Booking',
  menuMineButton: 'Booking Saya',

  // 2. Date Selection
  chooseDate: '🗓 Silakan pilih tanggal reservasi:',

  // 3. Capster Selection
  chooseCapster: '👤 Silakan pilih kapster yang kamu inginkan:',
  capsterAny: '✨ Siapa saja',
  noCapsterAvailable: 'Maaf, belum ada kapster yang tersedia di tanggal ini. Silakan pilih tanggal lain.',

  // 4. Time Group & Time Slot
  chooseTimeGroup: '⏰ Mau booking di waktu apa?',
  timeGroupMorning: '🌅 Pagi (<12:00)',
  timeGroupAfternoon: '☀️ Siang (12:00-17:00)',
  timeGroupEvening: '🌙 Sore/Malam (≥17:00)',
  chooseTimeSlot: '⏰ Silakan pilih jam booking yang tersedia:',
  noSlotsAvailable: 'Maaf, semua slot sudah penuh di tanggal ini. Silakan pilih tanggal lain atau kapster lain.',

  // 5. Confirmation
  confirmBooking: (params: { capsterName: string; dateStr: string; timeStr: string }) =>
    `Cek dulu ya detail reservasi kamu:\n\n` +
    `👤 <b>Kapster:</b> ${params.capsterName}\n` +
    `🗓 <b>Tanggal:</b> ${params.dateStr}\n` +
    `⏰ <b>Jam:</b> ${params.timeStr} WIB\n\n` +
    `Sudah benar?`,

  btnConfirmYes: '✅ Ya, booking',
  btnConfirmChange: '✏️ Ubah',

  // 6. Ticket Issued
  ticketSuccess: (params: {
    ticketCode: string;
    capsterName: string;
    dateStr: string;
    timeStr: string;
  }) =>
    `Booking berhasil! ✅\n\n` +
    `🎟 <b>Nomor Tiket:</b> <code>${params.ticketCode}</code>\n` +
    `👤 <b>Kapster:</b> ${params.capsterName}\n` +
    `🗓 <b>Tanggal:</b> ${params.dateStr}\n` +
    `⏰ <b>Jam:</b> ${params.timeStr} WIB\n\n` +
    `Harap datang 5-10 menit sebelum jam reservasi ya. Untuk melihat atau membatalkan, pilih menu <b>"Booking Saya"</b>.`,

  // 7. Error / Slot Clashed
  slotClashed: '⚠️ Maaf, jam tersebut baru saja terisi oleh pelanggan lain. Silakan pilih jam lain ya.',

  // 8. My Bookings ("Booking Saya")
  noActiveBookings: 'Kamu belum memiliki reservasi aktif saat ini.',
  myBookingsTitle: '📋 Berikut daftar reservasi aktif kamu:\n(Pilih satu untuk melihat detail)',
  bookingDetail: (params: {
    ticketCode: string;
    capsterName: string;
    dateStr: string;
    timeStr: string;
    status: string;
  }) =>
    `🎟 <b>Detail Tiket:</b> <code>${params.ticketCode}</code>\n\n` +
    `👤 <b>Kapster:</b> ${params.capsterName}\n` +
    `🗓 <b>Tanggal:</b> ${params.dateStr}\n` +
    `⏰ <b>Jam:</b> ${params.timeStr} WIB\n` +
    `📌 <b>Status:</b> ${params.status.toUpperCase()}`,

  btnCancelBooking: '❌ Batalkan Booking',
  btnBackToMenu: '🏠 Menu Utama',

  // 9. Cancellation Flow
  cancelConfirmation: (ticketCode: string) =>
    `Apakah kamu yakin ingin membatalkan booking dengan tiket <code>${ticketCode}</code>?`,
  btnCancelConfirmYes: 'Ya, Batalkan',
  btnCancelConfirmNo: 'Kembali',
  cancelSuccess: (ticketCode: string) =>
    `Booking dengan tiket <code>${ticketCode}</code> telah berhasil dibatalkan. ✅`,

  // 10. Free text & Fallback
  freeTextFallback: 'Silakan pilih lewat tombol yang tersedia ya 🙏',
  invalidAction: 'Tombol sudah kedaluwarsa atau tidak sesuai. Silakan lanjutkan dari langkah ini:',

  // 11. Proactive notifications (sent from dashboard)
  cancelledByAdmin: (ticketCode: string) =>
    `Maaf, booking <code>${ticketCode}</code> dibatalkan oleh barber. 🙏\n` +
    `Silakan booking ulang lewat menu atau hubungi admin.`,
};
