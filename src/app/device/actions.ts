'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/server/auth/session';
import { getDefaultBranch } from '@/server/admin/capsters';
import { deviceBusy30, deviceFinishCurrent, deviceWalkIn } from '@/server/admin/device';
import { formatJakartaDisplayTime } from '@/lib/time';

export type DeviceActionResult = { ok: boolean; message: string };

const schema = z.object({
  capsterId: z.number().int().positive(),
  action: z.enum(['walkin', 'finish', 'busy30']),
});

export async function deviceAction(input: { capsterId: number; action: string }): Promise<DeviceActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Input tidak valid' };
  const { capsterId, action } = parsed.data;

  let result: DeviceActionResult;
  if (action === 'walkin') {
    const branch = await getDefaultBranch();
    if (!branch) return { ok: false, message: 'Belum ada cabang aktif' };
    const res = await deviceWalkIn({ branchId: branch.id, capsterId });
    result = res.success
      ? { ok: true, message: `Walk-in dicatat (${res.booking.ticketCode})` }
      : {
          ok: false,
          message: res.nextBookingAt
            ? `Bentrok — booking berikutnya jam ${formatJakartaDisplayTime(res.nextBookingAt)}. Pakai kapster lain atau atur lewat dashboard.`
            : 'Kapster sedang tidak bisa menerima walk-in.',
        };
  } else if (action === 'finish') {
    const res = await deviceFinishCurrent({ capsterId });
    result = res.success
      ? { ok: true, message: `Selesai — ${res.booking.ticketCode}, sisa slot dibuka` }
      : { ok: false, message: 'Tidak ada pelanggan yang sedang dikerjakan' };
  } else {
    await deviceBusy30({ capsterId });
    result = { ok: true, message: 'Ditandai sibuk 30 menit' };
  }

  revalidatePath('/admin', 'layout');
  return result;
}
