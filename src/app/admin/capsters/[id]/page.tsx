import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { DAY_NAMES_ID, formatDayShifts, getCapsterDetail } from '@/server/admin/capsters';
import {
  addTimeOffAction,
  deleteTimeOffAction,
  saveScheduleAction,
  updateCapsterAction,
} from '@/app/admin/actions';
import { formatJakartaDisplayDate, formatJakartaDisplayTime, getJakartaDateString } from '@/lib/time';
import { Flash, PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';

// Monday-first for display
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default async function CapsterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const [{ id }, { msg, error }] = await Promise.all([params, searchParams]);
  const capsterId = Number(id);
  if (!Number.isInteger(capsterId) || capsterId <= 0) notFound();

  const detail = await getCapsterDetail(capsterId);
  if (!detail) notFound();
  const { capster, schedules, timeOffs } = detail;
  const today = getJakartaDateString(new Date());

  return (
    <>
      <Link href="/admin/capsters" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Semua kapster
      </Link>
      <PageHeader title={capster.name} description={capster.isActive ? 'Aktif — tampil di bot' : 'Nonaktif — tidak tampil di bot'} />
      <Flash msg={msg} error={error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <Card className="border-white/10 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Profil</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateCapsterAction} className="space-y-4">
                <input type="hidden" name="id" value={capster.id} />
                <div className="space-y-2">
                  <Label htmlFor="capster-name">Nama</Label>
                  <Input id="capster-name" name="name" defaultValue={capster.name} required maxLength={60} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input id="capster-active" type="checkbox" name="isActive" defaultChecked={capster.isActive} className="size-4 accent-amber-500" />
                  Aktif (bisa dibooking)
                </label>
                <SubmitButton id="capster-save" variant="secondary">Simpan</SubmitButton>
              </form>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Libur &amp; blokir waktu</CardTitle>
              <CardDescription>Slot di rentang ini tidak bisa dibooking.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={addTimeOffAction} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="capsterId" value={capster.id} />
                <div className="space-y-1">
                  <Label htmlFor="off-start-date" className="text-xs">Mulai</Label>
                  <Input id="off-start-date" type="date" name="startDate" defaultValue={today} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="off-start-time" className="text-xs">Jam</Label>
                  <Input id="off-start-time" type="time" name="startTime" defaultValue="00:00" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="off-end-date" className="text-xs">Selesai</Label>
                  <Input id="off-end-date" type="date" name="endDate" defaultValue={today} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="off-end-time" className="text-xs">Jam</Label>
                  <Input id="off-end-time" type="time" name="endTime" defaultValue="23:59" required />
                </div>
                <Input id="off-reason" name="reason" placeholder="Alasan (opsional)" className="col-span-2" maxLength={120} />
                <SubmitButton id="off-submit" variant="secondary" className="col-span-2">Tambah libur</SubmitButton>
              </form>

              {timeOffs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada libur mendatang.</p>
              ) : (
                <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                  {timeOffs.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <p>
                          {formatJakartaDisplayDate(new Date(o.startsAt))} {formatJakartaDisplayTime(new Date(o.startsAt))} →{' '}
                          {formatJakartaDisplayTime(new Date(o.endsAt))}
                          {getJakartaDateString(new Date(o.startsAt)) !== getJakartaDateString(new Date(o.endsAt)) &&
                            ` (${formatJakartaDisplayDate(new Date(o.endsAt))})`}
                        </p>
                        {o.reason && <p className="text-xs text-muted-foreground">{o.reason}</p>}
                      </div>
                      <form action={deleteTimeOffAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="capsterId" value={capster.id} />
                        <Button id={`off-delete-${o.id}`} variant="ghost" size="icon" title="Hapus" className="text-red-300 hover:text-red-200">
                          <Trash2 className="size-4" />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">Jadwal mingguan</CardTitle>
            <CardDescription>
              Format: <code className="text-amber-300">09:00-12:00, 13:00-17:00</code>. Kosongkan untuk hari libur. Jeda antar shift = jam istirahat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveScheduleAction} className="space-y-3">
              <input type="hidden" name="capsterId" value={capster.id} />
              {DAY_ORDER.map((day) => (
                <div key={day} className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
                  <Label htmlFor={`day-${day}`} className={day === 0 ? 'text-red-300' : ''}>
                    {DAY_NAMES_ID[day]}
                  </Label>
                  <Input
                    id={`day-${day}`}
                    name={`day-${day}`}
                    placeholder="Libur"
                    defaultValue={formatDayShifts(schedules.filter((s) => s.dayOfWeek === day))}
                    className="font-mono"
                  />
                </div>
              ))}
              <SubmitButton id="schedule-save" className="mt-2">Simpan jadwal</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
