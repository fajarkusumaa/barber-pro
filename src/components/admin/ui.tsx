import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  const isError = Boolean(error);
  return (
    <div
      id="flash-message"
      role="status"
      className={cn(
        'mb-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300',
        isError
          ? 'border-red-500/30 bg-red-500/10 text-red-200'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      )}
    >
      {isError ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
      {error ?? msg}
    </div>
  );
}

const STATUS: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Terjadwal', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  completed: { label: 'Selesai', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  no_show: { label: 'No-show', className: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
  cancelled: { label: 'Dibatalkan', className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400 line-through' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}

const SOURCE: Record<string, string> = { bot: 'Bot', admin: 'Admin', walkin: 'Walk-in' };

export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="border-white/10 text-muted-foreground">
      {SOURCE[source] ?? source}
    </Badge>
  );
}

export function LateBadge() {
  return (
    <Badge variant="outline" className="animate-pulse border-red-500/40 bg-red-500/15 text-red-300">
      Terlambat
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Native select styled like shadcn Input; works in plain GET/Server Action forms. */
export const selectClassName =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>option]:bg-background';
