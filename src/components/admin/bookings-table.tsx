import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookingRow, isBookingLate } from '@/server/admin/bookings';
import { formatJakartaDisplayTime } from '@/lib/time';
import { LateBadge, SourceBadge, StatusBadge } from './ui';
import { BookingRowActions } from './booking-row-actions';

export function BookingsTable({
  rows,
  returnTo,
  now = new Date(),
}: {
  rows: BookingRow[];
  returnTo: string;
  now?: Date;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-muted-foreground">
        Belum ada booking untuk filter ini.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-card/40 backdrop-blur">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Jam</TableHead>
            <TableHead>Tiket</TableHead>
            <TableHead>Pelanggan</TableHead>
            <TableHead>Kapster</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id} id={`booking-row-${b.id}`} className="transition-colors">
              <TableCell className="font-mono tabular-nums">
                {formatJakartaDisplayTime(new Date(b.startsAt))}
                <span className="text-muted-foreground">–{formatJakartaDisplayTime(new Date(b.endsAt))}</span>
              </TableCell>
              <TableCell className="font-mono text-xs">{b.ticketCode}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{b.customerName ?? b.guestName ?? '—'}</span>
                  <SourceBadge source={b.source} />
                </div>
              </TableCell>
              <TableCell>{b.capsterName}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={b.status} />
                  {isBookingLate({ status: b.status, startsAt: new Date(b.startsAt) }, now) && <LateBadge />}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {b.status === 'confirmed' ? (
                  <BookingRowActions
                    bookingId={b.id}
                    ticketCode={b.ticketCode}
                    hasCustomer={b.customerId !== null}
                    returnTo={returnTo}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
