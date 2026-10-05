import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { listCapsters } from '@/server/admin/capsters';
import { createCapsterAction } from '@/app/admin/actions';
import { Flash, PageHeader } from '@/components/admin/ui';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/submit-button';

export default async function CapstersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { msg, error } = await searchParams;
  const rows = await listCapsters();

  return (
    <>
      <PageHeader title="Kapster" description="Kelola kapster, jadwal mingguan, dan libur." />
      <Flash msg={msg} error={error} />

      <form action={createCapsterAction} className="mb-6 flex max-w-md gap-2">
        <Input id="capster-new-name" name="name" placeholder="Nama kapster baru" required maxLength={60} />
        <SubmitButton id="capster-new-submit">
          <Plus className="size-4" /> Tambah
        </SubmitButton>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <Link
            key={c.id}
            id={`capster-card-${c.id}`}
            href={`/admin/capsters/${c.id}`}
            className="group flex items-center gap-4 rounded-xl border border-white/10 bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-amber-400/30 hover:bg-card/70"
          >
            <div className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/30 to-orange-600/30 text-lg font-semibold text-amber-200">
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.name}</p>
              {c.isActive ? (
                <Badge variant="outline" className="mt-1 border-emerald-500/30 text-emerald-300">Aktif</Badge>
              ) : (
                <Badge variant="outline" className="mt-1 border-zinc-500/30 text-zinc-400">Nonaktif</Badge>
              )}
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </>
  );
}
