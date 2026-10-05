import Link from 'next/link';
import { listCustomers } from '@/server/admin/bookings';
import { formatJakartaDisplayDate } from '@/lib/time';
import { PageHeader } from '@/components/admin/ui';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function CustomersPage() {
  const rows = await listCustomers();

  return (
    <>
      <PageHeader title="Pelanggan" description={`${rows.length} pelanggan dari bot`} />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-muted-foreground">
          Belum ada pelanggan. Pelanggan otomatis tercatat saat chat ke bot.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nama</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Booking aktif</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Terakhir chat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link id={`customer-${c.id}`} href={`/admin/customers/${c.id}`} className="font-medium hover:text-amber-300">
                      {c.name ?? `#${c.externalId}`}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-sky-500/30 text-sky-300 capitalize">{c.channel}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.activeBookings}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.totalBookings}</TableCell>
                  <TableCell className="text-muted-foreground">{formatJakartaDisplayDate(new Date(c.lastInboundAt))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
