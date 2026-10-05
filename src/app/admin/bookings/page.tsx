import Link from 'next/link';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { listBookings, BookingStatus } from '@/server/admin/bookings';
import { listCapsters } from '@/server/admin/capsters';
import { getJakartaDateString } from '@/lib/time';
import { BookingsTable } from '@/components/admin/bookings-table';
import { Flash, PageHeader, selectClassName } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const filterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  capsterId: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.enum(['confirmed', 'completed', 'no_show', 'cancelled']).optional().catch(undefined),
});

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter = filterSchema.parse({
    date: sp.date || undefined,
    capsterId: sp.capsterId || undefined,
    status: sp.status || undefined,
  });
  const now = new Date();
  const date = filter.date ?? getJakartaDateString(now);

  const [rows, capsterList] = await Promise.all([
    listBookings({ date, capsterId: filter.capsterId, status: filter.status as BookingStatus | undefined }),
    listCapsters(),
  ]);

  const qs = new URLSearchParams();
  qs.set('date', date);
  if (filter.capsterId) qs.set('capsterId', String(filter.capsterId));
  if (filter.status) qs.set('status', filter.status);
  const returnTo = `/admin/bookings?${qs.toString()}`;

  return (
    <>
      <PageHeader title="Booking" description={`${rows.length} booking`}>
        <Button asChild id="bookings-new">
          <Link href={`/admin/bookings/new?date=${date}`}>
            <Plus className="size-4" /> Booking manual
          </Link>
        </Button>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-card/40 p-3">
        <div className="space-y-1">
          <Label htmlFor="filter-date" className="text-xs">Tanggal</Label>
          <Input id="filter-date" type="date" name="date" defaultValue={date} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-capster" className="text-xs">Kapster</Label>
          <select id="filter-capster" name="capsterId" defaultValue={filter.capsterId ?? ''} className={selectClassName}>
            <option value="">Semua</option>
            {capsterList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-status" className="text-xs">Status</Label>
          <select id="filter-status" name="status" defaultValue={filter.status ?? ''} className={selectClassName}>
            <option value="">Semua</option>
            <option value="confirmed">Terjadwal</option>
            <option value="completed">Selesai</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>
        <Button id="filter-submit" type="submit" variant="secondary">Terapkan</Button>
        <Button asChild variant="ghost">
          <Link href="/admin/bookings">Reset</Link>
        </Button>
      </form>

      <BookingsTable rows={rows} returnTo={returnTo} now={now} />
    </>
  );
}
