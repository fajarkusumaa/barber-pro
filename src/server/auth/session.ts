import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { signSessionToken, verifySessionToken } from './crypto';
import { getAdminById } from './admin-users';

export const SESSION_COOKIE = 'bb_session';
/** Long-lived so the shared branch device stays logged in. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function createSession(uid: number) {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const token = signSessionToken({ uid, exp }, env.AUTH_SECRET);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the logged-in admin, or null. */
export async function getCurrentAdmin() {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value, env.AUTH_SECRET);
  if (!payload) return null;
  return getAdminById(payload.uid);
}

/**
 * Use in layouts/pages AND every Server Action / route handler.
 * Redirects to /login when not authenticated.
 */
export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  return admin;
}
