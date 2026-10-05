'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/server/auth/session';
import {
  addTimeOff,
  createCapster,
  deleteTimeOff,
  getDefaultBranch,
  parseDayShifts,
  replaceWeeklySchedule,
  Shift,
  updateCapster,
} from '@/server/admin/capsters';
import {
  adminCancelBooking,
  adminCompleteBooking,
  adminMarkNoShow,
  createManualBooking,
} from '@/server/admin/bookings';
import { resolveChannel } from '@/server/channels/registry';
import { parseJakartaDateTime } from '@/lib/time';

const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Only allow redirects back into the dashboard. */
function safeReturn(value: FormDataEntryValue | null, fallback: string) {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/admin') ? v : fallback;
}

function withParam(path: string, key: 'msg' | 'error', value: string) {
  const url = new URL(path, 'http://x');
  url.searchParams.delete('msg');
  url.searchParams.delete('error');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

// ---------- Bookings ----------

const bookingActionSchema = z.object({
  bookingId: id,
  action: z.enum(['complete', 'no_show', 'cancel']),
});

export async function bookingAction(formData: FormData) {
  await requireAdmin();
  const back = safeReturn(formData.get('returnTo'), '/admin/bookings');
  const parsed = bookingActionSchema.safeParse({
    bookingId: formData.get('bookingId'),
    action: formData.get('action'),
  });
  if (!parsed.success) redirect(withParam(back, 'error', 'Input tidak valid'));

  const { bookingId, action } = parsed.data;
  let message: string;
  if (action === 'complete') {
    const res = await adminCompleteBooking(bookingId);
    message = res.success ? `Booking ${res.booking.ticketCode} ditandai selesai` : 'Booking tidak bisa diselesaikan';
  } else if (action === 'no_show') {
    const res = await adminMarkNoShow(bookingId);
    message = res.success ? `Booking ${res.booking.ticketCode} ditandai no-show` : 'Booking tidak bisa ditandai no-show';
  } else {
    const res = await adminCancelBooking(bookingId, resolveChannel);
    message = res.success
      ? `Booking ${res.booking.ticketCode} dibatalkan${res.notified ? ' — pelanggan sudah diberi tahu' : ''}`
      : 'Booking tidak bisa dibatalkan';
  }

  revalidatePath('/admin', 'layout');
  redirect(withParam(back, 'msg', message));
}

const manualBookingSchema = z.object({
  capsterId: id,
  date,
  time,
  guestName: z.string().trim().min(1, 'Nama tamu wajib diisi').max(80),
  notes: z.string().trim().max(200).optional(),
});

export async function createManualBookingAction(formData: FormData) {
  await requireAdmin();
  const raw = {
    capsterId: formData.get('capsterId'),
    date: formData.get('date'),
    time: formData.get('time'),
    guestName: formData.get('guestName') ?? '',
    notes: formData.get('notes') || undefined,
  };
  const back = `/admin/bookings/new?capsterId=${raw.capsterId ?? ''}&date=${raw.date ?? ''}`;
  const parsed = manualBookingSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(withParam(back, 'error', parsed.error.issues[0]?.message ?? 'Input tidak valid'));
  }

  const branch = await getDefaultBranch();
  if (!branch) redirect(withParam(back, 'error', 'Belum ada cabang aktif'));

  const res = await createManualBooking({
    branchId: branch.id,
    capsterId: parsed.data.capsterId,
    startsAt: parseJakartaDateTime(parsed.data.date, parsed.data.time),
    guestName: parsed.data.guestName,
    notes: parsed.data.notes,
  });
  if (!res.success) redirect(withParam(back, 'error', 'Slot sudah terisi, pilih jam lain'));

  revalidatePath('/admin', 'layout');
  redirect(
    withParam(`/admin/bookings?date=${parsed.data.date}`, 'msg', `Booking ${res.booking.ticketCode} dibuat`)
  );
}

// ---------- Capsters ----------

export async function createCapsterAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.string().trim().min(1).max(60).safeParse(formData.get('name'));
  if (!parsed.success) redirect(withParam('/admin/capsters', 'error', 'Nama kapster wajib diisi'));
  const branch = await getDefaultBranch();
  if (!branch) redirect(withParam('/admin/capsters', 'error', 'Belum ada cabang aktif'));
  const capster = await createCapster({ branchId: branch.id, name: parsed.data });
  revalidatePath('/admin', 'layout');
  redirect(withParam(`/admin/capsters/${capster.id}`, 'msg', 'Kapster ditambahkan. Atur jadwalnya di bawah.'));
}

export async function updateCapsterAction(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({ id, name: z.string().trim().min(1).max(60), isActive: z.boolean() })
    .safeParse({ id: formData.get('id'), name: formData.get('name'), isActive: formData.get('isActive') === 'on' });
  const back = `/admin/capsters/${formData.get('id')}`;
  if (!parsed.success) redirect(withParam(back, 'error', 'Input tidak valid'));
  await updateCapster(parsed.data);
  revalidatePath('/admin', 'layout');
  redirect(withParam(back, 'msg', 'Data kapster disimpan'));
}

export async function saveScheduleAction(formData: FormData) {
  await requireAdmin();
  const capsterId = id.safeParse(formData.get('capsterId'));
  if (!capsterId.success) redirect('/admin/capsters');
  const back = `/admin/capsters/${capsterId.data}`;

  const shifts: Shift[] = [];
  for (let day = 0; day < 7; day++) {
    const input = z.string().max(200).catch('').parse(formData.get(`day-${day}`) ?? '');
    const res = parseDayShifts(day, input);
    if (!res.ok) redirect(withParam(back, 'error', res.error));
    shifts.push(...res.shifts);
  }

  await replaceWeeklySchedule(capsterId.data, shifts);
  revalidatePath('/admin', 'layout');
  redirect(withParam(back, 'msg', 'Jadwal mingguan disimpan'));
}

const timeOffSchema = z.object({
  capsterId: id,
  startDate: date,
  startTime: time,
  endDate: date,
  endTime: time,
  reason: z.string().trim().max(120).optional(),
});

export async function addTimeOffAction(formData: FormData) {
  await requireAdmin();
  const back = `/admin/capsters/${formData.get('capsterId')}`;
  const parsed = timeOffSchema.safeParse({
    capsterId: formData.get('capsterId'),
    startDate: formData.get('startDate'),
    startTime: formData.get('startTime'),
    endDate: formData.get('endDate'),
    endTime: formData.get('endTime'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) redirect(withParam(back, 'error', 'Tanggal/jam libur tidak valid'));

  const d = parsed.data;
  const res = await addTimeOff({
    capsterId: d.capsterId,
    startsAt: parseJakartaDateTime(d.startDate, d.startTime),
    endsAt: parseJakartaDateTime(d.endDate, d.endTime),
    reason: d.reason,
  });
  if (!res.success) redirect(withParam(back, 'error', 'Waktu selesai harus setelah waktu mulai'));
  revalidatePath('/admin', 'layout');
  redirect(withParam(back, 'msg', 'Libur ditambahkan'));
}

export async function deleteTimeOffAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id, capsterId: id }).safeParse({
    id: formData.get('id'),
    capsterId: formData.get('capsterId'),
  });
  if (!parsed.success) redirect('/admin/capsters');
  await deleteTimeOff(parsed.data.id);
  revalidatePath('/admin', 'layout');
  redirect(withParam(`/admin/capsters/${parsed.data.capsterId}`, 'msg', 'Libur dihapus'));
}
