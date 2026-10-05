import { getCurrentAdmin } from '@/server/auth/session';
import { getDefaultBranch } from '@/server/admin/capsters';
import { getDeviceState } from '@/server/admin/device';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const branch = await getDefaultBranch();
  if (!branch) return Response.json({ capsters: [], serverTime: new Date().toISOString() });

  const capsters = await getDeviceState(branch.id);
  return Response.json(
    { capsters, serverTime: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
