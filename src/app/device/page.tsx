import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/server/auth/session';
import { getDefaultBranch } from '@/server/admin/capsters';
import { getDeviceState } from '@/server/admin/device';
import { DeviceBoard } from './device-board';

export const metadata: Metadata = { title: 'Perangkat Cabang — BarberBot' };
export const dynamic = 'force-dynamic';

export default async function DevicePage() {
  if (!(await getCurrentAdmin())) redirect('/login?next=/device');
  const branch = await getDefaultBranch();
  const initial = branch ? await getDeviceState(branch.id) : [];

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-4 pb-24">
      <h1 className="sr-only">Perangkat cabang</h1>
      <DeviceBoard initial={initial} branchName={branch?.name ?? 'Belum ada cabang'} />
    </main>
  );
}
