import { LogOut, Scissors } from 'lucide-react';
import { requireAdmin } from '@/server/auth/session';
import { logoutAction } from '@/app/login/actions';
import { AdminNav } from '@/components/admin/nav';
import { Button } from '@/components/ui/button';
import { bookingConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-gradient-to-b from-amber-500/[0.07] to-transparent" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 p-4 md:flex-row md:p-6">
        <aside className="md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:w-56 md:shrink-0">
          <div className="flex h-full flex-col gap-6 rounded-2xl border border-white/10 bg-card/50 p-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-500/20">
                <Scissors className="size-4 text-black" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">{bookingConfig.shopName}</p>
                <p className="text-xs text-muted-foreground">Dashboard</p>
              </div>
            </div>
            <AdminNav />
            <div className="mt-auto hidden items-center justify-between gap-2 border-t border-white/10 pt-4 md:flex">
              <span className="truncate text-xs text-muted-foreground">{admin.email}</span>
              <form action={logoutAction}>
                <Button id="logout-button" variant="ghost" size="icon" title="Keluar">
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 animate-in fade-in duration-300">{children}</main>
      </div>
    </div>
  );
}
