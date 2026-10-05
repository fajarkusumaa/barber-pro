'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, LayoutDashboard, Scissors, Smartphone, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/admin', label: 'Ringkasan', icon: LayoutDashboard, exact: true },
  { href: '/admin/bookings', label: 'Booking', icon: CalendarDays },
  { href: '/admin/capsters', label: 'Kapster', icon: Scissors },
  { href: '/admin/customers', label: 'Pelanggan', icon: Users },
  { href: '/device', label: 'Perangkat', icon: Smartphone },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            id={`nav-${href.replace(/\//g, '-').slice(1)}`}
            href={href}
            className={cn(
              'group flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground',
              active && 'bg-gradient-to-r from-amber-500/15 to-transparent text-foreground ring-1 ring-amber-500/20'
            )}
          >
            <Icon className={cn('size-4 transition-colors', active ? 'text-amber-400' : 'group-hover:text-amber-300')} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
