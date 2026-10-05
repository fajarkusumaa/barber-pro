import Link from 'next/link';
import { CalendarCheck, CheckCircle2, Footprints, MessageCircle, Plus, UserX } from 'lucide-react';
import { getTodaySummary, listBookings } from '@/server/admin/bookings';
import { formatJakartaDisplayDate, getJakartaDateString } from '@/lib/time';
import { BookingsTable } from '@/components/admin/bookings-table';
import { Flash, PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { msg, error } = await searchParams;
  const now = new Date();
  const today = getJakartaDateString(now);
  const [summary, rows] = await Promise.all([getTodaySummary(today), listBookings({ date: today })]);

  const stats = [
    { label: 'Booking hari ini', value: summary.total, icon: CalendarCheck, tone: 'from-amber-400/20 text-amber-300' },
    { label: 'Dari bot', value: summary.fromBot, icon: MessageCircle, tone: 'from-sky-400/20 text-sky-300' },
    { label: 'Walk-in', value: summary.walkins, icon: Footprints, tone: 'from-fuchsia-400/20 text-fuchsia-300' },
    { label: 'Selesai', value: summary.completed, icon: CheckCircle2, tone: 'from-emerald-400/20 text-emerald-300' },
    { label: 'No-show', value: summary.noShows, icon: UserX, tone: 'from-orange-400/20 text-orange-300' },
  ];

  return (
    <>
      <PageHeader title="Ringkasan" description={formatJakartaDisplayDate(now)}>
        <Button asChild id="summary-new-booking">
          <Link href="/admin/bookings/new">
            <Plus className="size-4" /> Booking manual
          </Link>
        </Button>
      </PageHeader>
      <Flash msg={msg} error={error} />

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, tone }, i) => (
          <div
            key={label}
            style={{ animationDelay: `${i * 60}ms` }}
            className={`group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${tone.split(' ')[0]} to-transparent p-4 transition-transform duration-300 hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2 fill-mode-both`}
          >
            <Icon className={`mb-3 size-5 ${tone.split(' ')[1]}`} />
            <p className="text-3xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Jadwal hari ini</h2>
        <Link href="/admin/bookings" className="text-sm text-amber-300 hover:underline">
          Lihat semua →
        </Link>
      </div>
      <BookingsTable rows={rows} returnTo="/admin" now={now} />
    </>
  );
}
