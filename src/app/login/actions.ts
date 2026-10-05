'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/server/auth/admin-users';
import { createSession, destroySession } from '@/server/auth/session';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  });
  if (!parsed.success) redirect('/login?error=1');

  const admin = await authenticateAdmin(parsed.data.email, parsed.data.password);
  if (!admin) redirect('/login?error=1');

  await createSession(admin.id);
  const next = parsed.data.next;
  redirect(next === '/device' || next?.startsWith('/admin') ? next : '/admin');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
