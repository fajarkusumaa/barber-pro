import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import fs from 'fs';
import path from 'path';

export async function createTestDatabase() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema }) as any;

  // Execute base schema migration
  const migration0 = fs.readFileSync(
    path.resolve(__dirname, '../../src/db/migrations/0000_slimy_celestials.sql'),
    'utf-8'
  );

  const statements0 = migration0
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements0) {
    try {
      await pglite.exec(statement);
    } catch (e) {
      // ignore if already exists
    }
  }

  // Execute custom migration if supported
  try {
    const migration1 = fs.readFileSync(
      path.resolve(__dirname, '../../src/db/migrations/0001_anti_double_booking.sql'),
      'utf-8'
    );
    await pglite.exec(migration1);
  } catch (err) {
    // If PGlite wasm build doesn't include btree_gist extension, we log or mock constraint
    console.warn('PGlite extension note:', (err as Error).message);
  }

  return { pglite, db };
}
