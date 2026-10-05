'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Coffee, Footprints, LayoutDashboard, Loader2, RefreshCw, Scissors, Wifi, WifiOff } from 'lucide-react';
import type { CapsterDeviceState } from '@/server/admin/device';
import { deviceAction, type DeviceActionResult } from './actions';
import { cn } from '@/lib/utils';

const POLL_MS = 15_000;
const ARM_MS = 3_000;

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
const hhmm = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : '');

type Action = 'walkin' | 'finish' | 'busy30';

const STATUS_STYLE: Record<CapsterDeviceState['status'], { label: string; ring: string; dot: string; glow: string }> = {
  free: { label: 'Kosong', ring: 'border-emerald-500/40', dot: 'bg-emerald-400', glow: 'from-emerald-500/15' },
  serving: { label: 'Sedang mengerjakan', ring: 'border-amber-500/40', dot: 'bg-amber-400', glow: 'from-amber-500/15' },
  busy: { label: 'Sibuk', ring: 'border-orange-500/40', dot: 'bg-orange-400', glow: 'from-orange-500/15' },
  off: { label: 'Di luar jam kerja', ring: 'border-white/10', dot: 'bg-zinc-500', glow: 'from-zinc-500/5' },
};

function statusLine(c: CapsterDeviceState) {
  switch (c.status) {
    case 'serving':
      return `sampai ${hhmm(c.busyUntil)}${c.currentGuest ? ` · ${c.currentGuest}` : ''}`;
    case 'busy':
      return `sampai ${hhmm(c.busyUntil)}`;
    case 'free':
      return c.freeUntil ? `kosong sampai ${hhmm(c.freeUntil)}` : 'kosong sampai tutup';
    default:
      return c.nextBookingAt ? `booking berikutnya ${hhmm(c.nextBookingAt)}` : '—';
  }
}

export function DeviceBoard({ initial, branchName }: { initial: CapsterDeviceState[]; branchName: string }) {
  const [capsters, setCapsters] = useState(initial);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState(() => new Date());
  const [armed, setArmed] = useState<string | null>(null);
  const [toast, setToast] = useState<DeviceActionResult | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/device/state', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login?next=/device';
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { capsters: CapsterDeviceState[] };
      setCapsters(data.capsters);
      setOnline(true);
      setLastSync(new Date());
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const showToast = (r: DeviceActionResult) => {
    setToast(r);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), r.ok ? 3500 : 7000);
  };

  // Tap 1 arms the button, tap 2 executes => 2 taps per action, no accidental walk-ins.
  const onTap = (capsterId: number, action: Action) => {
    const key = `${capsterId}:${action}`;
    if (armed !== key) {
      setArmed(key);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), ARM_MS);
      return;
    }
    setArmed(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        showToast(await deviceAction({ capsterId, action }));
        await refresh();
      } catch {
        showToast({ ok: false, message: 'Gagal terhubung. Coba lagi.' });
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <>
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-white/5 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600">
            <Scissors className="size-4 text-black" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{branchName}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {online ? <Wifi className="size-3 text-emerald-400" /> : <WifiOff className="size-3 text-red-400" />}
              {online ? `Sinkron ${timeFmt.format(lastSync)}` : 'Offline — mencoba lagi'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button id="device-refresh" onClick={refresh} className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground active:scale-95" title="Muat ulang">
            <RefreshCw className="size-5" />
          </button>
          <Link id="device-dashboard" href="/admin" className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground" title="Dashboard">
            <LayoutDashboard className="size-5" />
          </Link>
        </div>
      </header>

      {capsters.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 p-10 text-center text-muted-foreground">Belum ada kapster aktif.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {capsters.map((c, i) => {
          const s = STATUS_STYLE[c.status];
          const buttons: { action: Action; label: string; icon: typeof Footprints; enabled: boolean; tone: string }[] = [
            { action: 'walkin', label: 'Walk-in', icon: Footprints, enabled: c.status !== 'serving', tone: 'bg-amber-500 text-black hover:bg-amber-400' },
            { action: 'finish', label: 'Selesai', icon: CheckCircle2, enabled: c.status === 'serving', tone: 'bg-emerald-500 text-black hover:bg-emerald-400' },
            { action: 'busy30', label: 'Sibuk 30m', icon: Coffee, enabled: c.status !== 'busy', tone: 'bg-white/10 text-foreground hover:bg-white/15' },
          ];
          return (
            <section
              key={c.capsterId}
              id={`device-capster-${c.capsterId}`}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cn(
                'relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-4 transition-colors duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-both',
                s.ring,
                s.glow
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <span className="relative flex size-2.5">
                      {c.status !== 'off' && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', s.dot)} />}
                      <span className={cn('relative inline-flex size-2.5 rounded-full', s.dot)} />
                    </span>
                    {s.label}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="size-3.5" /> {statusLine(c)}
                  </p>
                </div>
                {c.currentTicket && <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-xs">{c.currentTicket}</span>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {buttons.map(({ action, label, icon: Icon, enabled, tone }) => {
                  const key = `${c.capsterId}:${action}`;
                  const isArmed = armed === key;
                  const isPending = pendingKey === key;
                  return (
                    <button
                      key={action}
                      id={`device-${action}-${c.capsterId}`}
                      disabled={!enabled || pendingKey !== null}
                      onClick={() => onTap(c.capsterId, action)}
                      className={cn(
                        'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-2 text-sm font-medium transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-30',
                        tone,
                        isArmed && 'ring-2 ring-white ring-offset-2 ring-offset-background animate-pulse'
                      )}
                    >
                      {isPending ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                      <span className="text-xs leading-tight">{isArmed ? 'Ketuk lagi' : label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {toast && (
        <div
          id="device-toast"
          role="status"
          className={cn(
            'fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4',
            toast.ok ? 'border-emerald-500/30 bg-emerald-950/80 text-emerald-100' : 'border-red-500/30 bg-red-950/80 text-red-100'
          )}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
