import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Scissors } from 'lucide-react';
import { getCurrentAdmin } from '@/server/auth/session';
import { loginAction } from './actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';

export const metadata: Metadata = { title: 'Masuk — BarberBot' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  if (await getCurrentAdmin()) redirect(next === '/device' ? '/device' : '/admin');

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 size-[28rem] rounded-full bg-fuchsia-600/10 blur-3xl" />

      <Card className="relative w-full max-w-sm border-white/10 bg-card/70 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-500/30">
            <Scissors className="size-6 text-black" />
          </div>
          <CardTitle className="text-xl">
            Masuk ke BarberBot
          </CardTitle>
          <CardDescription>Dashboard admin &amp; perangkat cabang</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next ?? ''} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && (
              <p id="login-error" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                Email atau password salah.
              </p>
            )}
            <SubmitButton id="login-submit" className="w-full">
              Masuk
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
