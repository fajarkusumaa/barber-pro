import Link from 'next/link';
import { z } from 'zod';
import { getAdminSlots } from '@/server/admin/bookings';
import { listCapsters } from '@/server/admin/capsters';
import { createManualBookingAction } from '@/app/admin/actions';
import { getJakartaDateString } from '@/lib/time';
import { Flash, PageHeader, selectClassName } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';

const paramsSchema = z.object({
  capsterId: z.coerce.number().int().positive().optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const p = paramsSchema.parse({ capsterId: sp.capsterId || undefined, date: sp.date || undefined });
  const date = p.date ?? getJakartaDateString(new Date());
  const capsterList = (await listCapsters()).filter((c) => c.isActive);
  const slots = p.capsterId ? await getAdminSlots({ capsterId: p.capsterId, date }) : [];

  return (
    <>
      <PageHeader title="Booking manual" description="Untuk pelanggan yang booking lewat telepon/chat admin." />
      <Flash msg={sp.msg} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">1. Pilih kapster &amp; tanggal</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="get" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-capster">Kapster</Label>
                <select id="new-capster" name="capsterId" required defaultValue={p.capsterId ?? ''} className={`${selectClassName} w-full`}>
                  <option value="" disabled>Pilih kapster</option>
                  {capsterList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-date">Tanggal</Label>
                <Input id="new-date" type="date" name="date" defaultValue={date} required />
              </div>
              <Button id="new-show-slots" type="submit" variant="secondary">Tampilkan jam kosong</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">2. Pilih jam &amp; isi nama tamu</CardTitle>
          </CardHeader>
          <CardContent>
            {!p.capsterId ? (
              <p className="text-sm text-muted-foreground">Pilih kapster dan tanggal terlebih dulu.</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada jam kosong di tanggal ini.</p>
            ) : (
              <form action={createManualBookingAction} className="space-y-4">
                <input type="hidden" name="capsterId" value={p.capsterId} />
                <input type="hidden" name="date" value={date} />
                <fieldset className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  <legend className="mb-2 text-sm font-medium">Jam</legend>
                  {slots.map((s, i) => (
                    <label key={s.timeString} className="cursor-pointer">
                      <input type="radio" name="time" value={s.timeString} required defaultChecked={i === 0} className="peer sr-only" />
                      <span className="block rounded-md border border-white/10 py-2 text-center font-mono text-sm tabular-nums transition-all hover:border-amber-400/50 peer-checked:border-amber-400 peer-checked:bg-amber-400/15 peer-checked:text-amber-200 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400/50">
                        {s.timeString}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor="new-guest">Nama tamu</Label>
                  <Input id="new-guest" name="guestName" required maxLength={80} placeholder="mis. Pak Andi" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-notes">Catatan (opsional)</Label>
                  <Input id="new-notes" name="notes" maxLength={200} placeholder="No. HP, permintaan khusus…" />
                </div>
                <div className="flex gap-2">
                  <SubmitButton id="new-submit">Buat booking</SubmitButton>
                  <Button asChild variant="ghost">
                    <Link href="/admin/bookings">Batal</Link>
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
