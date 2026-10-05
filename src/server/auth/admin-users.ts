import 'server-only';
import { eq } from 'drizzle-orm';
import { db as defaultDb, Database, adminUsers, AdminUser } from '@/db';
import { hashPassword, verifyPassword } from './crypto';

export async function authenticateAdmin(
  email: string,
  password: string,
  db: Database = defaultDb
): Promise<AdminUser | null> {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email.trim().toLowerCase()));
  if (!user) {
    // Run a dummy hash so timing doesn't reveal whether the email exists
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function getAdminById(id: number, db: Database = defaultDb) {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
  return user ?? null;
}

export async function upsertAdmin(
  params: { email: string; name: string; password: string },
  db: Database = defaultDb
) {
  const email = params.email.trim().toLowerCase();
  const passwordHash = await hashPassword(params.password);
  const [user] = await db
    .insert(adminUsers)
    .values({ email, name: params.name, passwordHash })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: { name: params.name, passwordHash, updatedAt: new Date() },
    })
    .returning();
  return user;
}
