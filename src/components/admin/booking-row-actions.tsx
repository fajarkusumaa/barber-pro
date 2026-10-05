'use client';

import { Ban, Check, UserX } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { bookingAction } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';

function ActionButton({
  action,
  label,
  icon: Icon,
  className,
  confirmText,
  bookingId,
}: {
  action: string;
  label: string;
  icon: typeof Check;
  className: string;
  confirmText?: string;
  bookingId: number;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      id={`booking-${bookingId}-${action}`}
      type="submit"
      name="action"
      value={action}
      size="sm"
      variant="ghost"
      disabled={pending}
      title={label}
      className={className}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <Icon className="size-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </Button>
  );
}

export function BookingRowActions({
  bookingId,
  ticketCode,
  hasCustomer,
  returnTo,
}: {
  bookingId: number;
  ticketCode: string;
  hasCustomer: boolean;
  returnTo: string;
}) {
  return (
    <form action={bookingAction} className="flex justify-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <ActionButton bookingId={bookingId} action="complete" label="Selesai" icon={Check} className="text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200" />
      <ActionButton bookingId={bookingId} action="no_show" label="No-show" icon={UserX} className="text-orange-300 hover:bg-orange-500/10 hover:text-orange-200" confirmText={`Tandai ${ticketCode} sebagai no-show?`} />
      <ActionButton
        bookingId={bookingId}
        action="cancel"
        label="Batalkan"
        icon={Ban}
        className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
        confirmText={`Batalkan booking ${ticketCode}?${hasCustomer ? ' Pelanggan akan menerima notifikasi.' : ''}`}
      />
    </form>
  );
}
