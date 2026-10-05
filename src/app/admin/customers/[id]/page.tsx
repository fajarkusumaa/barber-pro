import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCustomerWithBookings } from '@/server/admin/bookings';
import { formatJakartaDisplayDate, formatJakartaDisplayTime } from '@/lib/time';
import { PageHeader, SourceBadge, StatusBadge } from '@/components/admin/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) notFound();
  const data = await getCustomerWithBookings(customerId);
  if (!data) notFound();
  const { customer, history } = data;

  return (
    <>
      <Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Semua pelanggan
      </Link>
      <PageHeader
        title={customer.name ?? `#${customer.externalId}`}
        description={`${customer.channel} · ${history.length} booking · bergabung ${formatJakartaDisplayDate(new Date(customer.createdAt))}`}
      />
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada riwayat booking.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tanggal</TableHead>
                <TableHead>Tiket</TableHead>
                <TableHead>Kapster</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    {formatJakartaDisplayDate(new Date(b.startsAt))}{' '}
                    <span className="font-mono text-muted-foreground">{formatJakartaDisplayTime(new Date(b.startsAt))}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.ticketCode}</TableCell>
                  <TableCell>{b.capsterName}</TableCell>
                  <TableCell><SourceBadge source={b.source} /></TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
